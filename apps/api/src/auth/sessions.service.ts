import { Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { PrismaService } from '../common/prisma/prisma.service.js';
import { Errors } from '../common/errors/app-error.js';
import { hashToken, randomToken } from './tokens.js';

export interface SessionPrincipal {
  userId: string;
  sessionId: string;
  emailVerified: boolean;
}

/** Owns the Session table: refresh-token rows grouped by familyId (AD-6). */
@Injectable()
export class SessionsService {
  constructor(private readonly prisma: PrismaService) {}

  /** Creates a refresh-token row. A new login starts a new family; a rotation reuses the family. */
  async create(
    userId: string,
    ttlDays: number,
    familyId: string = randomUUID(),
  ) {
    const refreshToken = randomToken();
    const session = await this.prisma.session.create({
      data: {
        userId,
        familyId,
        tokenHash: hashToken(refreshToken),
        expiresAt: new Date(Date.now() + ttlDays * 86_400_000),
      },
    });
    return { session, refreshToken };
  }

  /**
   * Rotates a refresh token. Exactly one caller can rotate a given token (conditional UPDATE);
   * presenting an already-rotated token, including a lost race, revokes the whole family.
   */
  async rotate(refreshToken: string) {
    const current = await this.prisma.session.findUnique({
      where: { tokenHash: hashToken(refreshToken) },
    });
    if (!current || current.revokedAt) throw Errors.sessionRevoked();
    if (current.rotatedAt) {
      await this.revokeFamily(current.familyId);
      throw Errors.sessionRevoked();
    }
    if (current.expiresAt.getTime() <= Date.now())
      throw Errors.sessionExpired();

    const claimed = await this.prisma.session.updateMany({
      where: { id: current.id, rotatedAt: null, revokedAt: null },
      data: { rotatedAt: new Date() },
    });
    if (claimed.count !== 1) {
      await this.revokeFamily(current.familyId);
      throw Errors.sessionRevoked();
    }
    return {
      userId: current.userId,
      familyId: current.familyId,
      sessionId: current.id,
    };
  }

  /**
   * Called once the successor row exists. A parallel loser may have revoked the family before the
   * successor was inserted; the rotated row then carries revokedAt, so the successor is revoked too.
   */
  async confirmRotation(sessionId: string, familyId: string): Promise<void> {
    const rotated = await this.prisma.session.findUnique({
      where: { id: sessionId },
      select: { revokedAt: true },
    });
    if (rotated?.revokedAt) {
      await this.revokeFamily(familyId);
      throw Errors.sessionRevoked();
    }
  }

  async revokeFamily(familyId: string): Promise<void> {
    await this.prisma.session.updateMany({
      where: { familyId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }

  /** Ends the login the refresh token belongs to. Unknown tokens are ignored. */
  async revokeByRefreshToken(refreshToken: string): Promise<void> {
    const session = await this.prisma.session.findUnique({
      where: { tokenHash: hashToken(refreshToken) },
    });
    if (session) await this.revokeFamily(session.familyId);
  }

  async revokeAllForUser(userId: string): Promise<void> {
    await this.prisma.session.updateMany({
      where: { userId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }

  /** Used by JwtAuthGuard on every request: the access token's session must still be live. */
  async principal(
    sessionId: string,
    userId: string,
  ): Promise<SessionPrincipal | null> {
    const session = await this.prisma.session.findUnique({
      where: { id: sessionId },
      select: {
        userId: true,
        revokedAt: true,
        user: { select: { emailVerifiedAt: true } },
      },
    });
    if (!session || session.revokedAt || session.userId !== userId) return null;
    return {
      userId,
      sessionId,
      emailVerified: session.user.emailVerifiedAt !== null,
    };
  }
}
