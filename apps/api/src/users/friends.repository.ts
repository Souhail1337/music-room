import { Injectable } from '@nestjs/common';
import { PrismaService } from '../common/prisma/prisma.service.js';
import { Prisma } from '../generated/prisma/client.js';
import type { Relation } from './user.view.js';

export type Tx = Prisma.TransactionClient;

/** The canonical order of a pair (userAId < userBId), so one row and one key cover both directions. */
export function pair(
  a: string,
  b: string,
): { userAId: string; userBId: string } {
  return a < b ? { userAId: a, userBId: b } : { userAId: b, userBId: a };
}

const userRef = { select: { id: true, displayName: true } } as const;

export interface RequestRow {
  id: string;
  createdAt: Date;
  user: { id: string; displayName: string };
}

@Injectable()
export class FriendsRepository {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Runs `fn` in a transaction holding an advisory lock on the pair {a, b}: two requests crossing
   * each other (A→B and B→A at the same moment) are serialized, so they end as one friendship.
   */
  withPairLock<T>(
    a: string,
    b: string,
    fn: (tx: Tx) => Promise<T>,
  ): Promise<T> {
    const { userAId, userBId } = pair(a, b);
    return this.prisma.$transaction(
      async (tx) => {
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`friends:${userAId}:${userBId}`}, 0))`;
        return fn(tx);
      },
      { timeout: 10_000 },
    );
  }

  /** How `viewerId` relates to `otherId`: friends, a pending request either way, or nothing. */
  async relation(
    viewerId: string,
    otherId: string,
    db: Tx | PrismaService = this.prisma,
  ): Promise<Relation> {
    if (viewerId === otherId) return { friendship: 'none' };
    const friendship = await db.friendship.findUnique({
      where: { userAId_userBId: pair(viewerId, otherId) },
    });
    if (friendship) return { friendship: 'friends' };
    const request = await db.friendRequest.findFirst({
      where: {
        OR: [
          { requesterId: viewerId, addresseeId: otherId },
          { requesterId: otherId, addresseeId: viewerId },
        ],
      },
      orderBy: { createdAt: 'asc' },
    });
    if (!request) return { friendship: 'none' };
    return {
      friendship: request.requesterId === viewerId ? 'outgoing' : 'incoming',
      requestId: request.id,
    };
  }

  async areFriends(
    a: string,
    b: string,
    db: Tx | PrismaService = this.prisma,
  ): Promise<boolean> {
    if (a === b) return false;
    return (await db.friendship.count({ where: pair(a, b) })) > 0;
  }

  /** Ids of everyone `userId` is friends with. */
  async friendIds(userId: string): Promise<string[]> {
    const rows = await this.prisma.friendship.findMany({
      where: { OR: [{ userAId: userId }, { userBId: userId }] },
      select: { userAId: true, userBId: true },
    });
    return rows.map((r) => (r.userAId === userId ? r.userBId : r.userAId));
  }

  async friends(
    userId: string,
  ): Promise<{ id: string; displayName: string; since: Date }[]> {
    const rows = await this.prisma.friendship.findMany({
      where: { OR: [{ userAId: userId }, { userBId: userId }] },
      include: { userA: userRef, userB: userRef },
    });
    return rows
      .map((r) => ({
        ...(r.userAId === userId ? r.userB : r.userA),
        since: r.createdAt,
      }))
      .sort(
        (x, y) =>
          x.displayName.localeCompare(y.displayName) ||
          x.id.localeCompare(y.id),
      );
  }

  async requests(
    userId: string,
  ): Promise<{ incoming: RequestRow[]; outgoing: RequestRow[] }> {
    const [incoming, outgoing] = await Promise.all([
      this.prisma.friendRequest.findMany({
        where: { addresseeId: userId },
        include: { requester: userRef },
        orderBy: [{ createdAt: 'desc' }, { id: 'asc' }],
      }),
      this.prisma.friendRequest.findMany({
        where: { requesterId: userId },
        include: { addressee: userRef },
        orderBy: [{ createdAt: 'desc' }, { id: 'asc' }],
      }),
    ]);
    return {
      incoming: incoming.map((r) => ({
        id: r.id,
        createdAt: r.createdAt,
        user: r.requester,
      })),
      outgoing: outgoing.map((r) => ({
        id: r.id,
        createdAt: r.createdAt,
        user: r.addressee,
      })),
    };
  }

  findRequest(id: string, db: Tx | PrismaService = this.prisma) {
    return db.friendRequest.findUnique({ where: { id } });
  }

  findRequestBetween(tx: Tx, requesterId: string, addresseeId: string) {
    return tx.friendRequest.findUnique({
      where: { requesterId_addresseeId: { requesterId, addresseeId } },
    });
  }

  createRequest(tx: Tx, requesterId: string, addresseeId: string) {
    return tx.friendRequest.create({ data: { requesterId, addresseeId } });
  }

  /** Makes a and b friends and removes every pending request between them. */
  async befriend(tx: Tx, a: string, b: string): Promise<void> {
    await tx.friendRequest.deleteMany({
      where: {
        OR: [
          { requesterId: a, addresseeId: b },
          { requesterId: b, addresseeId: a },
        ],
      },
    });
    await tx.friendship.createMany({
      data: [pair(a, b)],
      skipDuplicates: true,
    });
  }

  /** Deletes the request if `where` matches it; returns whether a row went away. */
  async deleteRequest(
    tx: Tx,
    id: string,
    where: { requesterId?: string; addresseeId?: string },
  ): Promise<boolean> {
    const { count } = await tx.friendRequest.deleteMany({
      where: { id, ...where },
    });
    return count > 0;
  }

  async unfriend(a: string, b: string): Promise<boolean> {
    const { count } = await this.prisma.friendship.deleteMany({
      where: pair(a, b),
    });
    return count > 0;
  }
}
