import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import {
  AccessResource,
  AccessService,
  Viewer,
} from '../access/access.service.js';
import { Errors } from '../common/errors/app-error.js';
import type { UserRef } from '../events/event.view.js';
import type { Prisma } from '../generated/prisma/client.js';
import { EventVisibility, PlaylistLicense } from '../generated/prisma/enums.js';
import { MusicService } from '../music/music.service.js';
import { TrackView } from '../music/track.view.js';
import { RealtimeService } from '../realtime/realtime.service.js';
import { UsersService } from '../users/users.service.js';
import type {
  CreatePlaylistDto,
  PlaylistLicenseValue,
  PlaylistScopeValue,
  PlaylistVisibilityValue,
  UpdatePlaylistDto,
} from './dto/playlist.dto.js';
import {
  PlaylistChangeKind,
  PlaylistDetail,
  PlaylistList,
  PlaylistPush,
  PlaylistState,
  PlaylistSummary,
  VersionConflictDetails,
} from './playlist.view.js';
import {
  PAGE_SIZE,
  PlaylistWithRefs,
  PlaylistsRepository,
  Snapshot,
  SummaryRow,
  Tx,
  UnknownUserError,
} from './playlists.repository.js';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const VISIBILITY_IN: Record<PlaylistVisibilityValue, EventVisibility> = {
  public: EventVisibility.PUBLIC,
  private: EventVisibility.PRIVATE,
};
const LICENSE_IN: Record<PlaylistLicenseValue, PlaylistLicense> = {
  everyone: PlaylistLicense.EVERYONE,
  invited: PlaylistLicense.INVITED,
};
const lower = <T extends string>(value: string) => value.toLowerCase() as T;

export const room = (playlistId: string) => `playlist:${playlistId}`;

/** Plain-object view of a response class (it is built as a literal, never instantiated). */
type Plain<T> = { [K in keyof T]: T[K] };

/** Thrown inside the transaction (so it rolls back) and turned into the 409 afterwards. */
class StaleVersion extends Error {
  constructor(readonly snapshot: Snapshot) {
    super('stale');
  }
}

/**
 * Playlist Editor (FR-17..FR-21). Every write is REST; pushes go out after commit (AD-1). Track
 * edits carry `baseVersion` and run with the playlist row locked (AD-3): a stale edit changes
 * nothing and answers 409 with the current state and who made the winning edit.
 */
@Injectable()
export class PlaylistsService implements OnModuleInit {
  private readonly logger = new Logger(PlaylistsService.name);

  constructor(
    private readonly playlists: PlaylistsRepository,
    private readonly access: AccessService,
    private readonly music: MusicService,
    private readonly realtime: RealtimeService,
    private readonly users: UsersService,
  ) {}

  onModuleInit(): void {
    // The socket `join` handler asks this before letting anyone into `playlist:<id>` (AD-4).
    this.realtime.registerRoomAuthorizer('playlist', async (userId, id) => {
      const playlist = await this.playlists.findById(id);
      if (!playlist) return false;
      return this.access.canView(
        await this.viewer(userId, playlist),
        resource(playlist),
      );
    });
    // Header avatars: presence in playlist rooms carries the viewers' names (FR-21).
    this.realtime.registerPresenceResolver('playlist', (ids) =>
      this.users.refs(ids),
    );
  }

  // --- Reads ----------------------------------------------------------------------------------

  async list(
    userId: string,
    scope: PlaylistScopeValue = 'discover',
    q?: string,
    cursor?: string,
  ): Promise<PlaylistList> {
    const where: Prisma.PlaylistWhereInput = {};
    switch (scope) {
      case 'discover':
        where.visibility = EventVisibility.PUBLIC;
        break;
      case 'mine':
        where.ownerId = userId;
        break;
      case 'shared':
        where.invites = { some: { userId } };
        break;
    }
    if (q) where.name = { contains: q, mode: 'insensitive' };
    const offset = cursor ? Number(cursor) : 0;
    const { rows, hasMore } = await this.playlists.list(where, offset);
    return {
      items: rows.map(summary),
      ...(hasMore ? { nextCursor: String(offset + PAGE_SIZE) } : {}),
    };
  }

  async get(userId: string, id: string): Promise<PlaylistDetail> {
    const { viewer } = await this.viewable(userId, id);
    const snapshot = await this.playlists.loadState(id);
    if (!snapshot) throw Errors.playlistNotFound();
    return this.detail(snapshot, viewer);
  }

  // --- Create / edit (FR-17, FR-18) -----------------------------------------------------------

  async create(
    userId: string,
    dto: CreatePlaylistDto,
  ): Promise<PlaylistDetail> {
    const created = await this.playlists.create({
      ownerId: userId,
      name: dto.name,
      description: dto.description ?? '',
      ...(dto.visibility ? { visibility: VISIBILITY_IN[dto.visibility] } : {}),
      ...(dto.license ? { license: LICENSE_IN[dto.license] } : {}),
    });
    return this.get(userId, created.id);
  }

  async update(
    userId: string,
    id: string,
    dto: UpdatePlaylistDto,
  ): Promise<PlaylistDetail> {
    const { playlist } = await this.viewable(userId, id);
    if (playlist.ownerId !== userId) throw Errors.notOwner();
    // Compared against the locked row: only real changes bump the version and broadcast.
    // `null` is treated like an omitted field (the columns are NOT NULL).
    const { changed, becamePrivate } = await this.playlists.transaction(
      async (tx) => {
        const locked = await this.playlists.lock(tx, id);
        if (!locked) throw Errors.playlistNotFound();
        const data: Prisma.PlaylistUncheckedUpdateInput = {};
        if (dto.name != null && dto.name !== locked.name) data.name = dto.name;
        if (dto.description != null && dto.description !== locked.description)
          data.description = dto.description;
        if (
          dto.visibility != null &&
          VISIBILITY_IN[dto.visibility] !== locked.visibility
        )
          data.visibility = VISIBILITY_IN[dto.visibility];
        if (dto.license != null && LICENSE_IN[dto.license] !== locked.license)
          data.license = LICENSE_IN[dto.license];
        if (Object.keys(data).length === 0)
          return { changed: false, becamePrivate: false };
        await this.playlists.update(tx, id, { ...data, lastEditorId: userId });
        return {
          changed: true,
          becamePrivate: data.visibility === EventVisibility.PRIVATE,
        };
      },
    );
    if (changed) {
      await this.broadcast(id, 'settings');
      if (becamePrivate) await this.realtime.reauthorize(room(id));
    }
    return this.get(userId, id);
  }

  // --- Invites (FR-18) ------------------------------------------------------------------------

  async invites(userId: string, id: string): Promise<{ items: UserRef[] }> {
    await this.ownerOnly(userId, id);
    const rows = await this.playlists.invites(id);
    return { items: rows.map((r) => r.user) };
  }

  async setInvite(
    userId: string,
    id: string,
    inviteeId: string,
    invited: boolean,
  ): Promise<{ items: UserRef[] }> {
    await this.ownerOnly(userId, id);
    if (!UUID.test(inviteeId)) throw Errors.userNotFound();
    if (inviteeId === userId)
      throw Errors.validation({
        fields: { userId: ['You own this playlist.'] },
      });
    let changed = false;
    try {
      changed = await this.playlists.transaction(async (tx) => {
        if (!(await this.playlists.lock(tx, id)))
          throw Errors.playlistNotFound();
        const done = invited
          ? await this.playlists.addInvite(tx, id, inviteeId)
          : await this.playlists.removeInvite(tx, id, inviteeId);
        if (done) await this.playlists.bumpVersion(tx, id, userId);
        return done;
      });
    } catch (error) {
      if (error instanceof UnknownUserError) throw Errors.userNotFound();
      throw error;
    }
    if (changed) {
      await this.broadcast(id, 'invites');
      if (!invited) await this.realtime.reauthorize(room(id));
    }
    return this.invites(userId, id);
  }

  // --- Track edits (FR-19, FR-20, AD-3) -------------------------------------------------------

  /** Appends the track at the end. A track appears at most once per playlist. */
  async addTrack(
    userId: string,
    id: string,
    trackId: string,
    baseVersion: number,
  ): Promise<PlaylistDetail> {
    const viewer = await this.editable(userId, id);
    // Deezer may be slow: resolve the track before taking the lock (AD-8).
    const track = await this.music.ensureTrack(trackId);
    await this.edit(id, userId, baseVersion, async (tx, order) => {
      if (await this.playlists.hasTrack(tx, id, track.id))
        throw Errors.trackAlreadyInPlaylist();
      await this.playlists.insertEntry(tx, id, track.id, order.length, userId);
      return true;
    });
    return this.after(id, viewer);
  }

  /** Moves the entry to `toIndex` (its final 0-based index); the others shift. */
  async moveTrack(
    userId: string,
    id: string,
    entryId: string,
    toIndex: number,
    baseVersion: number,
  ): Promise<PlaylistDetail> {
    const viewer = await this.editable(userId, id);
    if (!UUID.test(entryId)) throw Errors.playlistEntryNotFound();
    await this.edit(id, userId, baseVersion, async (tx, order) => {
      const from = order.indexOf(entryId);
      if (from < 0) throw Errors.playlistEntryNotFound();
      if (toIndex >= order.length)
        throw Errors.validation({
          fields: {
            toIndex: [`Must be between 0 and ${order.length - 1}.`],
          },
        });
      // Already there: nothing changes (no version bump, no push).
      if (from === toIndex) return false;
      const next = [...order];
      next.splice(from, 1);
      next.splice(toIndex, 0, entryId);
      await this.playlists.rewritePositions(tx, next);
      return true;
    });
    return this.after(id, viewer);
  }

  async removeTrack(
    userId: string,
    id: string,
    entryId: string,
    baseVersion: number,
  ): Promise<PlaylistDetail> {
    const viewer = await this.editable(userId, id);
    if (!UUID.test(entryId)) throw Errors.playlistEntryNotFound();
    await this.edit(id, userId, baseVersion, async (tx, order) => {
      if (!order.includes(entryId)) throw Errors.playlistEntryNotFound();
      await this.playlists.deleteEntry(tx, entryId);
      await this.playlists.rewritePositions(
        tx,
        order.filter((e) => e !== entryId),
      );
      return true;
    });
    return this.after(id, viewer);
  }

  // --- Internals ------------------------------------------------------------------------------

  /**
   * AD-3: lock the playlist row, compare `version` with `baseVersion` (mismatch → 409 with the
   * current state, nothing changes), apply `work`, bump the version and record the editor,
   * commit, then broadcast the full ordered list. `work` returns false when it changed nothing:
   * then there is no bump and no push.
   */
  private async edit(
    id: string,
    editorId: string,
    baseVersion: number,
    work: (tx: Tx, order: string[]) => Promise<boolean>,
  ): Promise<void> {
    let changed = false;
    try {
      changed = await this.playlists.transaction(async (tx) => {
        const locked = await this.playlists.lock(tx, id);
        if (!locked) throw Errors.playlistNotFound();
        if (locked.version !== baseVersion) {
          const snapshot = await this.playlists.stateIn(tx, id);
          if (!snapshot) throw Errors.playlistNotFound();
          throw new StaleVersion(snapshot);
        }
        const did = await work(tx, await this.playlists.order(tx, id));
        if (did) await this.playlists.bumpVersion(tx, id, editorId);
        return did;
      });
    } catch (error) {
      if (error instanceof StaleVersion) {
        const state = this.state(error.snapshot);
        const details: VersionConflictDetails = {
          playlist: state,
          lastEditor: state.lastEditor,
        };
        throw Errors.versionConflict(details);
      }
      if (isUniqueViolation(error)) throw Errors.trackAlreadyInPlaylist();
      throw error;
    }
    if (changed) await this.broadcast(id, 'tracks');
  }

  private async after(id: string, viewer: Viewer): Promise<PlaylistDetail> {
    const snapshot = await this.playlists.loadState(id);
    if (!snapshot) throw Errors.playlistNotFound();
    return this.detail(snapshot, viewer);
  }

  /** After commit: push the full ordered list + version to the room (AD-1). Never fails the request. */
  private async broadcast(
    id: string,
    change: PlaylistChangeKind,
  ): Promise<void> {
    try {
      const snapshot = await this.playlists.loadState(id);
      if (!snapshot) return;
      const push: PlaylistPush = {
        room: room(id),
        ...this.state(snapshot),
        change,
      };
      this.realtime.emit(room(id), 'playlist.updated', push);
    } catch (error) {
      this.logger.warn(`broadcast failed for ${id}: ${String(error)}`);
    }
  }

  /** 404 for unknown ids and for private playlists the user can't view (never reveals they exist). */
  private async viewable(
    userId: string,
    id: string,
  ): Promise<{ playlist: PlaylistWithRefs; viewer: Viewer }> {
    if (!UUID.test(id)) throw Errors.playlistNotFound();
    const playlist = await this.playlists.findById(id);
    if (!playlist) throw Errors.playlistNotFound();
    const viewer = await this.viewer(userId, playlist);
    if (!this.access.canView(viewer, resource(playlist)))
      throw Errors.playlistNotFound();
    return { playlist, viewer };
  }

  /** Viewable (else 404) and editable (else 403 READ_ONLY). */
  private async editable(userId: string, id: string): Promise<Viewer> {
    const { playlist, viewer } = await this.viewable(userId, id);
    this.access.assertCanAct(viewer, resource(playlist));
    return viewer;
  }

  private async ownerOnly(userId: string, id: string): Promise<void> {
    const { playlist } = await this.viewable(userId, id);
    if (playlist.ownerId !== userId) throw Errors.notOwner();
  }

  private async viewer(
    userId: string,
    playlist: { id: string; ownerId: string },
  ): Promise<Viewer> {
    return {
      userId,
      invited:
        playlist.ownerId !== userId &&
        (await this.playlists.isInvited(playlist.id, userId)),
    };
  }

  private async detail(
    snapshot: Snapshot,
    viewer: Viewer,
  ): Promise<PlaylistDetail> {
    const decision = this.access.canAct(viewer, resource(snapshot.playlist));
    const presence = await this.realtime.presenceOf(room(snapshot.playlist.id));
    return {
      ...this.state(snapshot),
      isOwner: snapshot.playlist.ownerId === viewer.userId,
      canEdit: {
        allowed: decision.allowed,
        reason: decision.allowed ? null : 'READ_ONLY',
      },
      viewers: presence.viewers ?? [],
    };
  }

  private state({ playlist, tracks }: Snapshot): Plain<PlaylistState> {
    return {
      playlist: {
        id: playlist.id,
        name: playlist.name,
        description: playlist.description,
        owner: playlist.owner,
        visibility: lower(playlist.visibility),
        license: lower(playlist.license),
      },
      tracks: tracks.map((e, index) => ({
        id: e.id,
        track: TrackView.of(e.track),
        position: index,
        addedBy: e.addedBy,
      })),
      version: playlist.version,
      lastEditor: playlist.lastEditor ?? null,
    };
  }
}

function resource(playlist: {
  ownerId: string;
  visibility: EventVisibility;
  license: PlaylistLicense;
}): AccessResource {
  return {
    kind: 'playlist',
    hostId: playlist.ownerId,
    visibility: playlist.visibility,
    license: playlist.license,
    lat: null,
    lng: null,
    radiusM: null,
    startsAt: null,
    endsAt: null,
  };
}

function summary(row: SummaryRow): PlaylistSummary {
  const collaborators: UserRef[] = [
    row.owner,
    ...row.invites.map((i) => i.user),
  ];
  return {
    id: row.id,
    name: row.name,
    owner: row.owner,
    visibility: lower(row.visibility),
    license: lower(row.license),
    trackCount: row._count.tracks,
    artworkUrl: row.tracks[0]?.track.artworkUrl ?? null,
    collaborators: collaborators.slice(0, 3),
  };
}

function isUniqueViolation(error: unknown): boolean {
  const e = error as { code?: string; meta?: { code?: string } };
  return e?.code === 'P2002' || e?.meta?.code === '23505';
}
