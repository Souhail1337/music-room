import { Injectable } from '@nestjs/common';
import { PrismaService } from '../common/prisma/prisma.service.js';
import { Prisma, User } from '../generated/prisma/client.js';

@Injectable()
export class UsersRepository {
  constructor(private readonly prisma: PrismaService) {}

  findById(id: string): Promise<User | null> {
    return this.prisma.user.findUnique({ where: { id } });
  }

  findByEmail(email: string): Promise<User | null> {
    return this.prisma.user.findUnique({ where: { email } });
  }

  findByGoogleSub(googleSub: string): Promise<User | null> {
    return this.prisma.user.findUnique({ where: { googleSub } });
  }

  create(data: Prisma.UserCreateInput): Promise<User> {
    return this.prisma.user.create({ data });
  }

  update(id: string, data: Prisma.UserUpdateInput): Promise<User> {
    return this.prisma.user.update({ where: { id }, data });
  }

  /** Sets googleSub only if none is linked yet; returns whether this call linked it. */
  async linkGoogleSub(id: string, googleSub: string): Promise<boolean> {
    const { count } = await this.prisma.user.updateMany({
      where: { id, googleSub: null },
      data: { googleSub },
    });
    return count > 0;
  }

  /**
   * Display-name prefix (case-insensitive) or exact email; only id + display name leave.
   * `ids` restricts the search to (`in`) or away from (`notIn`) a set of users.
   */
  search(
    q: string,
    email: string,
    excludeId: string,
    take: number,
    ids?: { in: string[] } | { notIn: string[] },
  ): Promise<{ id: string; displayName: string }[]> {
    return this.prisma.user.findMany({
      where: {
        AND: [{ id: { not: excludeId } }, ...(ids ? [{ id: ids }] : [])],
        OR: [
          { displayName: { startsWith: q, mode: 'insensitive' } },
          { email },
        ],
      },
      select: { id: true, displayName: true },
      orderBy: [{ displayName: 'asc' }, { id: 'asc' }],
      take,
    });
  }

  /** id + display name only, for presence lists. */
  refs(ids: string[]): Promise<{ id: string; displayName: string }[]> {
    return this.prisma.user.findMany({
      where: { id: { in: ids } },
      select: { id: true, displayName: true },
      orderBy: [{ displayName: 'asc' }, { id: 'asc' }],
    });
  }
}
