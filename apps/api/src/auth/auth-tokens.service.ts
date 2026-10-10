import { Injectable } from '@nestjs/common';
import { PrismaService } from '../common/prisma/prisma.service.js';
import { AuthTokenType } from '../generated/prisma/client.js';
import { hashToken, randomToken } from './tokens.js';

export const TOKEN_TTL_MS: Record<AuthTokenType, number> = {
  VERIFY_EMAIL: 24 * 60 * 60 * 1000,
  RESET_PASSWORD: 60 * 60 * 1000,
};

/** Single-use, hashed email tokens (verification 24h, password reset 1h). */
@Injectable()
export class AuthTokensService {
  constructor(private readonly prisma: PrismaService) {}

  /** Issues a new token; earlier unused tokens of the same type stop working, so only the latest link is live. */
  async issue(userId: string, type: AuthTokenType): Promise<string> {
    const token = randomToken();
    await this.prisma.authToken.updateMany({
      where: { userId, type, usedAt: null },
      data: { usedAt: new Date() },
    });
    await this.prisma.authToken.create({
      data: {
        userId,
        type,
        tokenHash: hashToken(token),
        expiresAt: new Date(Date.now() + TOKEN_TTL_MS[type]),
      },
    });
    return token;
  }

  /** Returns the userId if the token is currently usable, without consuming it. */
  async peek(token: string, type: AuthTokenType): Promise<string | null> {
    const row = await this.prisma.authToken.findUnique({
      where: { tokenHash: hashToken(token) },
    });
    if (
      !row ||
      row.type !== type ||
      row.usedAt ||
      row.expiresAt.getTime() <= Date.now()
    )
      return null;
    return row.userId;
  }

  /** Atomically marks the token used. Returns the userId, or null if unknown, expired or already used. */
  async consume(token: string, type: AuthTokenType): Promise<string | null> {
    const tokenHash = hashToken(token);
    const row = await this.prisma.authToken.findUnique({
      where: { tokenHash },
    });
    if (!row || row.type !== type) return null;
    const claimed = await this.prisma.authToken.updateMany({
      where: { id: row.id, usedAt: null, expiresAt: { gt: new Date() } },
      data: { usedAt: new Date() },
    });
    return claimed.count === 1 ? row.userId : null;
  }
}
