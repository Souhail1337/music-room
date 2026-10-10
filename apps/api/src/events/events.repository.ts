import { Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { PrismaService } from '../common/prisma/prisma.service.js';
import { Prisma } from '../generated/prisma/client.js';
import type { Event } from '../generated/prisma/client.js';

export type Tx = Prisma.TransactionClient;

const userRef = { select: { id: true, displayName: true } } as const;

export const eventWithRefs = {
  host: userRef,
  nowPlaying: true,
} as const satisfies Prisma.EventInclude;

export type EventWithRefs = Prisma.EventGetPayload<{
  include: typeof eventWithRefs;
}>;

const queueInclude = {
  track: true,
  suggestedBy: userRef,
} as const satisfies Prisma.SuggestionInclude;

export type QueueRow = Prisma.SuggestionGetPayload<{
  include: typeof queueInclude;
}>;

/** AD-2: queue order is computed, never stored. `id` only makes exact ties deterministic. */
const QUEUE_ORDER: Prisma.SuggestionOrderByWithRelationInput[] = [
  { voteCount: 'desc' },
  { createdAt: 'asc' },
  { id: 'asc' },
];

export const PAGE_SIZE = 20;

/** Owns events, event_invites, suggestions and votes. */
@Injectable()
export class EventsRepository {
  constructor(private readonly prisma: PrismaService) {}

  transaction<T>(fn: (tx: Tx) => Promise<T>): Promise<T> {
    return this.prisma.$transaction(fn, { timeout: 10_000 });
  }

  create(data: Prisma.EventUncheckedCreateInput): Promise<Event> {
    return this.prisma.event.create({ data });
  }

  findById(id: string): Promise<EventWithRefs | null> {
    return this.prisma.event.findUnique({
      where: { id },
      include: eventWithRefs,
    });
  }

  async isInvited(eventId: string, userId: string): Promise<boolean> {
    const invite = await this.prisma.eventInvite.findUnique({
      where: { eventId_userId: { eventId, userId } },
      select: { eventId: true },
    });
    return invite !== null;
  }

  /** Event + ranked queue read from one snapshot, so `version` matches the data. */
  async loadState(
    id: string,
  ): Promise<{ event: EventWithRefs; queue: QueueRow[] } | null> {
    const [event, queue] = await this.prisma.$transaction(
      [
        this.prisma.event.findUnique({ where: { id }, include: eventWithRefs }),
        this.prisma.suggestion.findMany({
          where: { eventId: id },
          include: queueInclude,
          orderBy: QUEUE_ORDER,
        }),
      ],
      { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead },
    );
    return event ? { event, queue } : null;
  }

  async myVotes(eventId: string, userId: string): Promise<string[]> {
    const votes = await this.prisma.vote.findMany({
      where: { userId, suggestion: { eventId } },
      select: { suggestionId: true },
    });
    return votes.map((v) => v.suggestionId);
  }

  async list(
    where: Prisma.EventWhereInput,
    offset: number,
  ): Promise<{ rows: EventWithRefs[]; hasMore: boolean }> {
    const rows = await this.prisma.event.findMany({
      where,
      include: eventWithRefs,
      // LIVE first (nowPlayingStartedAt is set only while a track plays), then newest.
      orderBy: [
        { nowPlayingStartedAt: { sort: 'desc', nulls: 'last' } },
        { createdAt: 'desc' },
        { id: 'asc' },
      ],
      skip: offset,
      take: PAGE_SIZE + 1,
    });
    return { rows: rows.slice(0, PAGE_SIZE), hasMore: rows.length > PAGE_SIZE };
  }

  invites(eventId: string) {
    return this.prisma.eventInvite.findMany({
      where: { eventId },
      orderBy: { createdAt: 'asc' },
      select: { user: userRef },
    });
  }

  // --- Inside a transaction -------------------------------------------------------------------

  /** Locks the event row: every queue change on one event is serialized behind it (AD-2, AD-9). */
  async lock(tx: Tx, id: string): Promise<Event | null> {
    const rows = await tx.$queryRaw<{ id: string }[]>`
      SELECT id FROM events WHERE id = ${id}::uuid FOR UPDATE`;
    if (rows.length === 0) return null;
    return tx.event.findUnique({ where: { id } });
  }

  bumpVersion(tx: Tx, id: string): Promise<unknown> {
    return tx.$executeRaw`UPDATE events SET version = version + 1, "updatedAt" = now() WHERE id = ${id}::uuid`;
  }

  update(tx: Tx, id: string, data: Prisma.EventUncheckedUpdateInput) {
    return tx.event.update({
      where: { id },
      data: { ...data, version: { increment: 1 } },
    });
  }

  findSuggestion(tx: Tx, eventId: string, suggestionId: string) {
    return tx.suggestion.findFirst({
      where: { id: suggestionId, eventId },
      select: { id: true },
    });
  }

  /** INSERT … ON CONFLICT DO NOTHING; returns the suggestion id and whether it is new. */
  async upsertSuggestion(
    tx: Tx,
    eventId: string,
    trackId: string,
    userId: string,
  ): Promise<{ id: string; created: boolean }> {
    const inserted = await tx.$queryRaw<{ id: string }[]>`
      INSERT INTO suggestions (id, "eventId", "trackId", "suggestedById", "voteCount", "createdAt")
      VALUES (${randomUUID()}::uuid, ${eventId}::uuid, ${trackId}, ${userId}::uuid, 0, clock_timestamp())
      ON CONFLICT ("eventId", "trackId") DO NOTHING
      RETURNING id`;
    if (inserted.length > 0) return { id: inserted[0].id, created: true };
    const existing = await tx.suggestion.findUniqueOrThrow({
      where: { eventId_trackId: { eventId, trackId } },
      select: { id: true },
    });
    return { id: existing.id, created: false };
  }

  /** AD-2: the vote row is unique; the count moves only when a row was actually inserted. */
  async addVote(
    tx: Tx,
    userId: string,
    suggestionId: string,
  ): Promise<boolean> {
    const inserted = await tx.$executeRaw`
      INSERT INTO votes ("userId", "suggestionId", "createdAt")
      VALUES (${userId}::uuid, ${suggestionId}::uuid, now())
      ON CONFLICT DO NOTHING`;
    if (inserted !== 1) return false;
    await tx.$executeRaw`UPDATE suggestions SET "voteCount" = "voteCount" + 1 WHERE id = ${suggestionId}::uuid`;
    return true;
  }

  /** AD-2: the count moves only when a row was actually deleted. */
  async removeVote(
    tx: Tx,
    userId: string,
    suggestionId: string,
  ): Promise<boolean> {
    const deleted = await tx.$executeRaw`
      DELETE FROM votes WHERE "userId" = ${userId}::uuid AND "suggestionId" = ${suggestionId}::uuid`;
    if (deleted !== 1) return false;
    await tx.$executeRaw`UPDATE suggestions SET "voteCount" = "voteCount" - 1 WHERE id = ${suggestionId}::uuid`;
    return true;
  }

  topSuggestion(tx: Tx, eventId: string) {
    return tx.suggestion.findFirst({
      where: { eventId },
      orderBy: QUEUE_ORDER,
      select: { id: true, trackId: true },
    });
  }

  deleteSuggestion(tx: Tx, id: string): Promise<unknown> {
    return tx.suggestion.delete({ where: { id } });
  }

  /** Returns false when the user does not exist (FK violation). */
  async addInvite(tx: Tx, eventId: string, userId: string): Promise<boolean> {
    try {
      const inserted = await tx.$executeRaw`
        INSERT INTO event_invites ("eventId", "userId", "createdAt")
        VALUES (${eventId}::uuid, ${userId}::uuid, now())
        ON CONFLICT DO NOTHING`;
      return inserted === 1;
    } catch (error) {
      if (isForeignKeyViolation(error)) throw new UnknownUserError();
      throw error;
    }
  }

  async removeInvite(
    tx: Tx,
    eventId: string,
    userId: string,
  ): Promise<boolean> {
    const deleted = await tx.eventInvite.deleteMany({
      where: { eventId, userId },
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
