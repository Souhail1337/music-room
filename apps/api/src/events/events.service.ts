import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import {
  AccessResource,
  AccessService,
  ActContext,
  Viewer,
} from '../access/access.service.js';
import { Errors } from '../common/errors/app-error.js';
import type { Prisma } from '../generated/prisma/client.js';
import { EventLicense, EventVisibility } from '../generated/prisma/enums.js';
import { MusicService } from '../music/music.service.js';
import { TrackView } from '../music/track.view.js';
import { RealtimeService } from '../realtime/realtime.service.js';
import type {
  CreateEventDto,
  LicenseValue,
  ScopeValue,
  UpdateEventDto,
  VisibilityValue,
} from './dto/event.dto.js';
import {
  ChangeKind,
  EventDetail,
  EventInfo,
  EventList,
  EventState,
  EventSummary,
  QueuePush,
  UserRef,
} from './event.view.js';
import {
  EventWithRefs,
  EventsRepository,
  PAGE_SIZE,
  QueueRow,
  Tx,
  UnknownUserError,
} from './events.repository.js';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const VISIBILITY_IN: Record<VisibilityValue, EventVisibility> = {
  public: EventVisibility.PUBLIC,
  private: EventVisibility.PRIVATE,
};
const LICENSE_IN: Record<LicenseValue, EventLicense> = {
  everyone: EventLicense.EVERYONE,
  invited: EventLicense.INVITED,
  on_site: EventLicense.ON_SITE,
};
const lower = <T extends string>(value: string) => value.toLowerCase() as T;

export const room = (eventId: string) => `event:${eventId}`;

/** Plain-object view of a response class (it is built as a literal, never instantiated). */
type Plain<T> = { [K in keyof T]: T[K] };

interface Snapshot {
  event: EventWithRefs;
  queue: QueueRow[];
}

/** Track Vote (FR-9..FR-16). Every write is REST; pushes go out after commit (AD-1). */
@Injectable()
export class EventsService implements OnModuleInit {
  private readonly logger = new Logger(EventsService.name);

  constructor(
    private readonly events: EventsRepository,
    private readonly access: AccessService,
    private readonly music: MusicService,
    private readonly realtime: RealtimeService,
  ) {}

  onModuleInit(): void {
    // The socket `join` handler asks this before letting anyone into `event:<id>` (AD-4).
    this.realtime.registerRoomAuthorizer('event', async (userId, id) => {
      const event = await this.events.findById(id);
      if (!event) return false;
      return this.access.canView(
        await this.viewer(userId, event),
        resource(event),
      );
    });
  }

  // --- Reads ----------------------------------------------------------------------------------

  async list(
    userId: string,
    scope: ScopeValue = 'discover',
    q?: string,
    cursor?: string,
  ): Promise<EventList> {
    const where: Prisma.EventWhereInput = {};
    switch (scope) {
      case 'discover':
        where.visibility = EventVisibility.PUBLIC;
        break;
      case 'hosting':
        where.hostId = userId;
        break;
      case 'invited':
        where.invites = { some: { userId } };
        break;
      case 'joined':
        where.OR = [
          { suggestions: { some: { suggestedById: userId } } },
          { suggestions: { some: { votes: { some: { userId } } } } },
        ];
        break;
    }
    if (q) where.name = { contains: q, mode: 'insensitive' };
    const offset = cursor ? Number(cursor) : 0;
    const { rows, hasMore } = await this.events.list(where, offset);
    return {
      items: rows.map((e) => this.summary(e)),
      ...(hasMore ? { nextCursor: String(offset + PAGE_SIZE) } : {}),
    };
  }

  async get(userId: string, id: string, ctx: ActContext): Promise<EventDetail> {
    const { event, viewer } = await this.viewable(userId, id);
    const snapshot = await this.events.loadState(event.id);
    if (!snapshot) throw Errors.eventNotFound();
    return this.detail(snapshot, viewer, ctx);
  }

  // --- Create / edit (FR-9, FR-10) ------------------------------------------------------------

  async create(userId: string, dto: CreateEventDto): Promise<EventDetail> {
    const data = settings(dto, null);
    const created = await this.events.create({
      hostId: userId,
      name: dto.name,
      description: dto.description ?? '',
      ...data,
    });
    return this.get(userId, created.id, {});
  }

  async update(
    userId: string,
    id: string,
    dto: UpdateEventDto,
  ): Promise<EventDetail> {
    const { event } = await this.viewable(userId, id);
    if (event.hostId !== userId) throw Errors.notHost();
    const becamePrivate =
      dto.visibility === 'private' &&
      event.visibility !== EventVisibility.PRIVATE;
    await this.events.transaction(async (tx) => {
      const locked = await this.events.lock(tx, id);
      if (!locked) throw Errors.eventNotFound();
      await this.events.update(tx, id, {
        ...(dto.name !== undefined ? { name: dto.name } : {}),
        ...(dto.description !== undefined
          ? { description: dto.description }
          : {}),
        ...settings(dto, locked),
      });
    });
    await this.broadcast(id, 'settings');
    if (becamePrivate) await this.realtime.reauthorize(room(id));
    return this.get(userId, id, {});
  }

  // --- Invites (FR-11) ------------------------------------------------------------------------

  async invites(userId: string, id: string): Promise<{ items: UserRef[] }> {
    await this.hostOnly(userId, id);
    const rows = await this.events.invites(id);
    return { items: rows.map((r) => r.user) };
  }

  async setInvite(
    userId: string,
    id: string,
    inviteeId: string,
    invited: boolean,
  ): Promise<{ items: UserRef[] }> {
    await this.hostOnly(userId, id);
    if (!UUID.test(inviteeId)) throw Errors.userNotFound();
    if (inviteeId === userId)
      throw Errors.validation({ fields: { userId: ['You host this event.'] } });
    let changed = false;
    try {
      changed = await this.events.transaction(async (tx) => {
        if (!(await this.events.lock(tx, id))) throw Errors.eventNotFound();
        const done = invited
          ? await this.events.addInvite(tx, id, inviteeId)
          : await this.events.removeInvite(tx, id, inviteeId);
        if (done) await this.events.bumpVersion(tx, id);
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

  // --- Queue (FR-12..FR-14) -------------------------------------------------------------------

  /** A new track joins with the suggester's vote; a queued track becomes the caller's vote (AD-2). */
  async suggest(
    userId: string,
    id: string,
    trackId: string,
    ctx: ActContext,
  ): Promise<EventDetail> {
    const { event, viewer } = await this.viewable(userId, id);
    this.access.assertCanAct(viewer, resource(event), ctx);
    const track = await this.music.ensureTrack(trackId);
    await this.mutate(id, 'queue', async (tx) => {
      const suggestion = await this.events.upsertSuggestion(
        tx,
        id,
        track.id,
        userId,
      );
      const voted = await this.events.addVote(tx, userId, suggestion.id);
      return suggestion.created || voted;
    });
    return this.get(userId, id, ctx);
  }

  async vote(
    userId: string,
    id: string,
    suggestionId: string,
    ctx: ActContext,
  ): Promise<EventDetail> {
    const { event, viewer } = await this.viewable(userId, id);
    this.access.assertCanAct(viewer, resource(event), ctx);
    if (!UUID.test(suggestionId)) throw Errors.suggestionNotFound();
    await this.mutate(id, 'queue', async (tx) => {
      if (!(await this.events.findSuggestion(tx, id, suggestionId)))
        throw Errors.suggestionNotFound();
      return this.events.addVote(tx, userId, suggestionId);
    });
    return this.get(userId, id, ctx);
  }

  /** Removing one's own vote only needs view access. */
  async unvote(
    userId: string,
    id: string,
    suggestionId: string,
    ctx: ActContext,
  ): Promise<EventDetail> {
    await this.viewable(userId, id);
    if (!UUID.test(suggestionId)) throw Errors.suggestionNotFound();
    await this.mutate(id, 'queue', async (tx) => {
      if (!(await this.events.findSuggestion(tx, id, suggestionId)))
        throw Errors.suggestionNotFound();
      return this.events.removeVote(tx, userId, suggestionId);
    });
    return this.get(userId, id, ctx);
  }

  // --- Now Playing (FR-16, AD-9) --------------------------------------------------------------

  /**
   * Host only. If `expectedNowPlayingId` no longer matches, nothing changes and the current state
   * is returned (another host device already advanced). Otherwise the top suggestion becomes
   * Now Playing and leaves the queue, in one transaction.
   */
  async advance(
    userId: string,
    id: string,
    expectedNowPlayingId: string | null,
  ): Promise<EventDetail> {
    const { event } = await this.viewable(userId, id);
    if (event.hostId !== userId) throw Errors.notHost();
    await this.mutate(id, 'nowPlaying', async (tx, locked) => {
      if ((locked.nowPlayingTrackId ?? null) !== expectedNowPlayingId)
        return false;
      const top = await this.events.topSuggestion(tx, id);
      if (!top && locked.nowPlayingTrackId === null) return false;
      if (top) await this.events.deleteSuggestion(tx, top.id);
      await tx.event.update({
        where: { id },
        data: {
          nowPlayingTrackId: top?.trackId ?? null,
          nowPlayingStartedAt: top ? new Date() : null,
        },
      });
      return true;
    });
    return this.get(userId, id, {});
  }

  // --- Internals ------------------------------------------------------------------------------

  /** Runs `work` with the event row locked; bumps `version` and broadcasts if it changed anything. */
  private async mutate(
    id: string,
    change: ChangeKind,
    work: (
      tx: Tx,
      locked: NonNullable<Awaited<ReturnType<EventsRepository['lock']>>>,
    ) => Promise<boolean>,
  ): Promise<void> {
    const changed = await this.events.transaction(async (tx) => {
      const locked = await this.events.lock(tx, id);
      if (!locked) throw Errors.eventNotFound();
      const did = await work(tx, locked);
      if (did) await this.events.bumpVersion(tx, id);
      return did;
    });
    if (changed) await this.broadcast(id, change);
  }

  /** After commit: push the full shared state + version to the room (AD-1). Never fails the request. */
  private async broadcast(id: string, change: ChangeKind): Promise<void> {
    try {
      const snapshot = await this.events.loadState(id);
      if (!snapshot) return;
      const push: QueuePush = { ...this.state(snapshot), change };
      this.realtime.emit(room(id), 'queue.updated', push);
    } catch (error) {
      this.logger.warn(`broadcast failed for ${id}: ${String(error)}`);
    }
  }

  /** 404 for unknown ids and for private events the user can't view (never reveals they exist). */
  private async viewable(
    userId: string,
    id: string,
  ): Promise<{ event: EventWithRefs; viewer: Viewer }> {
    if (!UUID.test(id)) throw Errors.eventNotFound();
    const event = await this.events.findById(id);
    if (!event) throw Errors.eventNotFound();
    const viewer = await this.viewer(userId, event);
    if (!this.access.canView(viewer, resource(event)))
      throw Errors.eventNotFound();
    return { event, viewer };
  }

  private async hostOnly(userId: string, id: string): Promise<void> {
    const { event } = await this.viewable(userId, id);
    if (event.hostId !== userId) throw Errors.notHost();
  }

  private async viewer(
    userId: string,
    event: { id: string; hostId: string },
  ): Promise<Viewer> {
    return {
      userId,
      invited:
        event.hostId !== userId &&
        (await this.events.isInvited(event.id, userId)),
    };
  }

  private async detail(
    snapshot: Snapshot,
    viewer: Viewer,
    ctx: ActContext,
  ): Promise<EventDetail> {
    const decision = this.access.canAct(viewer, resource(snapshot.event), ctx);
    return {
      ...this.state(snapshot),
      isHost: snapshot.event.hostId === viewer.userId,
      // Events never produce READ_ONLY (that reason is playlist-only).
      canAct: {
        allowed: decision.allowed,
        reason: decision.reason as EventDetail['canAct']['reason'],
      },
      myVotes: await this.events.myVotes(snapshot.event.id, viewer.userId),
    };
  }

  private state({ event, queue }: Snapshot): Plain<EventState> {
    return {
      event: info(event),
      nowPlaying:
        event.nowPlaying && event.nowPlayingStartedAt
          ? {
              track: TrackView.of(event.nowPlaying),
              startedAt: event.nowPlayingStartedAt.toISOString(),
            }
          : null,
      queue: queue.map((s) => ({
        id: s.id,
        track: TrackView.of(s.track),
        voteCount: s.voteCount,
        suggestedBy: s.suggestedBy,
        createdAt: s.createdAt.toISOString(),
      })),
      version: event.version,
      listeners: this.realtime.listenerCount(room(event.id)),
    };
  }

  private summary(event: EventWithRefs): EventSummary {
    return {
      id: event.id,
      name: event.name,
      host: event.host,
      visibility: lower(event.visibility),
      license: lower(event.license),
      startsAt: event.startsAt?.toISOString() ?? null,
      endsAt: event.endsAt?.toISOString() ?? null,
      live: event.nowPlaying !== null,
      nowPlaying: event.nowPlaying ? TrackView.of(event.nowPlaying) : null,
      listeners: this.realtime.listenerCount(room(event.id)),
    };
  }
}

function resource(
  event: EventWithRefs | Omit<EventWithRefs, 'host' | 'nowPlaying'>,
): AccessResource {
  return {
    hostId: event.hostId,
    visibility: event.visibility,
    license: event.license,
    lat: event.lat,
    lng: event.lng,
    radiusM: event.radiusM,
    startsAt: event.startsAt,
    endsAt: event.endsAt,
  };
}

function info(event: EventWithRefs): EventInfo {
  return {
    id: event.id,
    name: event.name,
    description: event.description,
    host: event.host,
    visibility: lower(event.visibility),
    license: lower(event.license),
    lat: event.lat,
    lng: event.lng,
    radiusM: event.radiusM,
    startsAt: event.startsAt?.toISOString() ?? null,
    endsAt: event.endsAt?.toISOString() ?? null,
  };
}

type SettingsInput = Pick<
  UpdateEventDto,
  'visibility' | 'license' | 'lat' | 'lng' | 'radiusM' | 'startsAt' | 'endsAt'
>;

/**
 * Merges visibility / license / venue onto the current values and checks the result: an on-site
 * event needs a venue, a radius and a window that ends after it starts (stored in UTC, AD-5).
 */
function settings(
  dto: SettingsInput,
  current: {
    license: EventLicense;
    lat: number | null;
    lng: number | null;
    radiusM: number | null;
    startsAt: Date | null;
    endsAt: Date | null;
  } | null,
) {
  const license = dto.license
    ? LICENSE_IN[dto.license]
    : (current?.license ?? EventLicense.EVERYONE);
  const lat = dto.lat ?? current?.lat ?? null;
  const lng = dto.lng ?? current?.lng ?? null;
  const radiusM = dto.radiusM ?? current?.radiusM ?? null;
  const startsAt = dto.startsAt
    ? new Date(dto.startsAt)
    : (current?.startsAt ?? null);
  const endsAt = dto.endsAt ? new Date(dto.endsAt) : (current?.endsAt ?? null);

  if (license === EventLicense.ON_SITE) {
    const fields: Record<string, string[]> = {};
    if (lat === null || lng === null) fields.lat = ['Set the venue location.'];
    if (radiusM === null) fields.radiusM = ['Choose a radius.'];
    if (startsAt === null) fields.startsAt = ['Choose when voting opens.'];
    if (endsAt === null) fields.endsAt = ['Choose when voting closes.'];
    if (startsAt && endsAt && endsAt.getTime() <= startsAt.getTime())
      fields.endsAt = ['The end must be after the start.'];
    if (Object.keys(fields).length > 0) throw Errors.validation({ fields });
  } else if (startsAt && endsAt && endsAt.getTime() <= startsAt.getTime()) {
    throw Errors.validation({
      fields: { endsAt: ['The end must be after the start.'] },
    });
  }

  return {
    ...(dto.visibility ? { visibility: VISIBILITY_IN[dto.visibility] } : {}),
    license,
    lat,
    lng,
    radiusM,
    startsAt,
    endsAt,
  };
}
