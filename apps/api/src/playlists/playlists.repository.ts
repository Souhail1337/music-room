import { Injectable } from '@nestjs/common';
import { PrismaService } from '../common/prisma/prisma.service.js';
import { Prisma } from '../generated/prisma/client.js';
import type { Playlist } from '../generated/prisma/client.js';

export type Tx = Prisma.TransactionClient;
type Db = Tx | PrismaService;

const userRef = { select: { id: true, displayName: true } } as const;

export const playlistWithRefs = {
  owner: userRef,
  lastEditor: userRef,
} as const satisfies Prisma.PlaylistInclude;

export type PlaylistWithRefs = Prisma.PlaylistGetPayload<{
  include: typeof playlistWithRefs;
}>;

const entryInclude = {
  track: true,
  addedBy: userRef,
} as const satisfies Prisma.PlaylistTrackInclude;

export type EntryRow = Prisma.PlaylistTrackGetPayload<{
  include: typeof entryInclude;
}>;

/** `id` only makes exact ties deterministic (positions are contiguous after every edit). */
const ENTRY_ORDER: Prisma.PlaylistTrackOrderByWithRelationInput[] = [
  { position: 'asc' },
  { id: 'asc' },
];

const summaryInclude = {
  owner: userRef,
  _count: { select: { tracks: true } },
  tracks: {
    orderBy: ENTRY_ORDER,
    take: 1,
    select: { track: { select: { artworkUrl: true } } },
  },
  invites: {
    orderBy: [{ createdAt: 'asc' }, { userId: 'asc' }],
    take: 2,
    select: { user: userRef },
  },
} as const satisfies Prisma.PlaylistInclude;

export type SummaryRow = Prisma.PlaylistGetPayload<{
  include: typeof summaryInclude;
}>;

export const PAGE_SIZE = 20;

export interface Snapshot {
  playlist: PlaylistWithRefs;
  tracks: EntryRow[];
}

/** Owns playlists, playlist_invites and playlist_tracks. */
@Injectable()
export class PlaylistsRepository {
  constructor(private readonly prisma: PrismaService) {}

  transaction<T>(fn: (tx: Tx) => Promise<T>): Promise<T> {
    return this.prisma.$transaction(fn, { timeout: 10_000 });
  }

  create(data: Prisma.PlaylistUncheckedCreateInput): Promise<Playlist> {
    return this.prisma.playlist.create({ data });
  }

  findById(id: string): Promise<PlaylistWithRefs | null> {
    return this.prisma.playlist.findUnique({
      where: { id },
      include: playlistWithRefs,
    });
  }

  async isInvited(playlistId: string, userId: string): Promise<boolean> {
    const invite = await this.prisma.playlistInvite.findUnique({
      where: { playlistId_userId: { playlistId, userId } },
      select: { playlistId: true },
    });
    return invite !== null;
  }

  /** Playlist + ordered tracks from one snapshot, so `version` matches the data. */
  async loadState(id: string): Promise<Snapshot | null> {
    const [playlist, tracks] = await this.prisma.$transaction(
      [
        this.prisma.playlist.findUnique({
          where: { id },
          include: playlistWithRefs,
        }),
        this.prisma.playlistTrack.findMany({
          where: { playlistId: id },
          include: entryInclude,
          orderBy: ENTRY_ORDER,
        }),
      ],
      { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead },
    );
    return playlist ? { playlist, tracks } : null;
  }

  async list(
    where: Prisma.PlaylistWhereInput,
    offset: number,
  ): Promise<{ rows: SummaryRow[]; hasMore: boolean }> {
    const rows = await this.prisma.playlist.findMany({
      where,
      include: summaryInclude,
      orderBy: [{ updatedAt: 'desc' }, { id: 'asc' }],
      skip: offset,
      take: PAGE_SIZE + 1,
    });
    return { rows: rows.slice(0, PAGE_SIZE), hasMore: rows.length > PAGE_SIZE };
  }

  invites(playlistId: string) {
    return this.prisma.playlistInvite.findMany({
      where: { playlistId },
      orderBy: [{ createdAt: 'asc' }, { userId: 'asc' }],
      select: { user: userRef },
    });
  }

  // --- Inside a transaction -------------------------------------------------------------------

  /** Locks the playlist row: every edit of one playlist is serialized behind it (AD-3). */
  async lock(tx: Tx, id: string): Promise<Playlist | null> {
    const rows = await tx.$queryRaw<{ id: string }[]>`
      SELECT id FROM playlists WHERE id = ${id}::uuid FOR UPDATE`;
    if (rows.length === 0) return null;
    return tx.playlist.findUnique({ where: { id } });
  }

  /** The state as seen inside the transaction (used for the 409 payload, under the lock). */
  async stateIn(tx: Db, id: string): Promise<Snapshot | null> {
    const playlist = await tx.playlist.findUnique({
      where: { id },
      include: playlistWithRefs,
    });
    if (!playlist) return null;
    const tracks = await tx.playlistTrack.findMany({
      where: { playlistId: id },
      include: entryInclude,
      orderBy: ENTRY_ORDER,
    });
    return { playlist, tracks };
  }

  /** Every accepted change: version + 1, and `lastEditorId` = whoever made it. */
  bumpVersion(tx: Tx, id: string, editorId: string): Promise<unknown> {
    return tx.$executeRaw`UPDATE playlists SET version = version + 1, "lastEditorId" = ${editorId}::uuid, "updatedAt" = now() WHERE id = ${id}::uuid`;
  }

  update(tx: Tx, id: string, data: Prisma.PlaylistUncheckedUpdateInput) {
    return tx.playlist.update({
      where: { id },
      data: { ...data, version: { increment: 1 } },
    });
  }

  /** Entry ids in order. */
  async order(tx: Tx, playlistId: string): Promise<string[]> {
    const rows = await tx.playlistTrack.findMany({
      where: { playlistId },
      orderBy: ENTRY_ORDER,
      select: { id: true },
    });
    return rows.map((r) => r.id);
  }

  hasTrack(tx: Tx, playlistId: string, trackId: string): Promise<boolean> {
    return tx.playlistTrack
      .findUnique({
        where: { playlistId_trackId: { playlistId, trackId } },
        select: { id: true },
      })
      .then((row) => row !== null);
  }

  insertEntry(
    tx: Tx,
    playlistId: string,
    trackId: string,
    position: number,
    addedById: string,
  ): Promise<unknown> {
    return tx.playlistTrack.create({
      data: { playlistId, trackId, position, addedById },
    });
  }

  deleteEntry(tx: Tx, id: string): Promise<unknown> {
    return tx.playlistTrack.delete({ where: { id } });
  }

  /** Writes positions 0..n-1 following `ids` (AD-3). One statement, under the playlist lock. */
  async rewritePositions(tx: Tx, ids: string[]): Promise<void> {
    if (ids.length === 0) return;
    const values = Prisma.join(
      ids.map((id, index) => Prisma.sql`(${id}::uuid, ${index}::int)`),
    );
    await tx.$executeRaw`
      UPDATE playlist_tracks AS pt SET position = v.position
      FROM (VALUES ${values}) AS v(id, position)
      WHERE pt.id = v.id AND pt.position IS DISTINCT FROM v.position`;
  }

  /** Returns false when the user does not exist (FK violation → UnknownUserError). */
  async addInvite(
    tx: Tx,
    playlistId: string,
    userId: string,
  ): Promise<boolean> {
    try {
      const inserted = await tx.$executeRaw`
        INSERT INTO playlist_invites ("playlistId", "userId", "createdAt")
        VALUES (${playlistId}::uuid, ${userId}::uuid, now())
        ON CONFLICT DO NOTHING`;
      return inserted === 1;
    } catch (error) {
      if (isForeignKeyViolation(error)) throw new UnknownUserError();
      throw error;
    }
  }

  async removeInvite(
    tx: Tx,
    playlistId: string,
    userId: string,
  ): Promise<boolean> {
    const deleted = await tx.playlistInvite.deleteMany({
      where: { playlistId, userId },
    });
    return deleted.count > 0;
  }
}

export class UnknownUserError extends Error {}

function isForeignKeyViolation(error: unknown): boolean {
  const e = error as {
    code?: string;
    meta?: { code?: string };
    message?: string;
  };
  return (
    e?.code === 'P2003' ||
    e?.meta?.code === '23503' ||
    (typeof e?.message === 'string' && e.message.includes('23503')) ||
    (typeof e?.message === 'string' && e.message.includes('foreign key'))
  );
}
