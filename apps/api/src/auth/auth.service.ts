import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import argon2 from 'argon2';
import { intEnv } from '../common/config/env.validation.js';
import { Errors } from '../common/errors/app-error.js';
import type { User } from '../generated/prisma/client.js';
import { MeView } from '../users/user.view.js';
import { UsersService } from '../users/users.service.js';
import { AuthTokensService } from './auth-tokens.service.js';
import { AuthResponse, SignupDto, TokensResponse } from './dto/auth.dto.js';
import { GoogleVerifierService } from './google-verifier.service.js';
import { MailService } from './mail.service.js';
import { SessionsService } from './sessions.service.js';

export type ResetResult = 'ok' | 'invalid' | 'weak' | 'mismatch';

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);
  private readonly accessTtlSeconds: number;
  private readonly refreshTtlDays: number;
  private readonly publicUrl: string;
  private dummyHash?: Promise<string>;

  constructor(
    config: ConfigService,
    private readonly jwt: JwtService,
    private readonly users: UsersService,
    private readonly sessions: SessionsService,
    private readonly authTokens: AuthTokensService,
    private readonly mail: MailService,
    private readonly google: GoogleVerifierService,
  ) {
    this.accessTtlSeconds = intEnv(
      config.get<string>('JWT_ACCESS_TTL_SECONDS'),
      900,
    );
    this.refreshTtlDays = intEnv(
      config.get<string>('REFRESH_TOKEN_TTL_DAYS'),
      30,
    );
    this.publicUrl = (
      config.get<string>('API_PUBLIC_URL') ?? 'http://localhost:3000'
    ).replace(/\/+$/, '');
  }

  /** Every login path ends here (AD-6): a 15-min access JWT plus a new refresh-token family. */
  async issueSession(user: User): Promise<AuthResponse> {
    const { accessToken, accessTokenExpiresIn, refreshToken } =
      await this.tokensFor(user.id);
    return {
      user: MeView.of(user),
      accessToken,
      accessTokenExpiresIn,
      refreshToken,
    };
  }

  async signup(dto: SignupDto): Promise<AuthResponse> {
    if (await this.users.findByEmail(dto.email)) throw Errors.emailTaken();
    const passwordHash = await argon2.hash(dto.password);
    const user = await this.users.createWithPassword({
      email: dto.email,
      displayName: dto.displayName,
      passwordHash,
    });
    await this.sendVerification(user);
    return this.issueSession(user);
  }

  async login(email: string, password: string): Promise<AuthResponse> {
    const user = await this.users.findByEmail(email);
    // Always run one argon2 verification so unknown emails take as long as wrong passwords.
    const hash = user?.passwordHash ?? (await this.getDummyHash());
    const ok = await argon2.verify(hash, password).catch(() => false);
    if (!user || !user.passwordHash || !ok) throw Errors.invalidCredentials();
    return this.issueSession(user);
  }

  async loginWithGoogle(idToken: string): Promise<AuthResponse> {
    if (!this.google.isConfigured()) throw Errors.googleNotConfigured();
    const identity = await this.google.verify(idToken);
    if (!identity) throw Errors.googleTokenInvalid();

    let user = await this.users.findByGoogleSub(identity.sub);
    if (!user) {
      // Linking Google to an existing email account is explicit (POST /me/google, FR-3), never a side effect of login.
      if (await this.users.findByEmail(identity.email))
        throw Errors.accountExists();
      user = await this.users.createFromGoogle({
        email: identity.email,
        displayName: identity.name,
        googleSub: identity.sub,
      });
    }
    return this.issueSession(user);
  }

  /** FR-3: verify the ID token on the server (AD-6), then link its `sub` to this account. */
  async linkGoogle(userId: string, idToken: string): Promise<MeView> {
    if (!this.google.isConfigured()) throw Errors.googleNotConfigured();
    const identity = await this.google.verify(idToken);
    if (!identity) throw Errors.googleTokenInvalid();
    return MeView.of(await this.users.linkGoogle(userId, identity.sub));
  }

  async refresh(refreshToken: string): Promise<TokensResponse> {
    const { userId, familyId, sessionId } =
      await this.sessions.rotate(refreshToken);
    const tokens = await this.tokensFor(userId, familyId);
    await this.sessions.confirmRotation(sessionId, familyId);
    return tokens;
  }

  logout(refreshToken: string): Promise<void> {
    return this.sessions.revokeByRefreshToken(refreshToken);
  }

  async resendVerification(userId: string): Promise<void> {
    const user = await this.users.findById(userId);
    if (!user || user.emailVerifiedAt) return;
    await this.sendVerification(user);
  }

  /** Same outcome (and no awaited mail) whether or not the email exists, so accounts can't be discovered. */
  async forgotPassword(email: string): Promise<void> {
    const user = await this.users.findByEmail(email);
    if (!user) return;
    const token = await this.authTokens.issue(user.id, 'RESET_PASSWORD');
    void this.mail.sendPasswordReset(
      user.email,
      user.displayName,
      `${this.publicUrl}/auth/reset?token=${token}`,
    );
  }

  async verifyEmail(token: string | undefined): Promise<boolean> {
    if (!token) return false;
    const userId = await this.authTokens.consume(token, 'VERIFY_EMAIL');
    if (!userId) return false;
    await this.users.markEmailVerified(userId);
    return true;
  }

  async isResetTokenUsable(token: string | undefined): Promise<boolean> {
    return (
      !!token && (await this.authTokens.peek(token, 'RESET_PASSWORD')) !== null
    );
  }

  async resetPassword(
    token: string | undefined,
    password: string,
    confirm: string,
  ): Promise<ResetResult> {
    if (!token || !(await this.isResetTokenUsable(token))) return 'invalid';
    if (password.length < 8 || password.length > 128) return 'weak';
    if (password !== confirm) return 'mismatch';
    const userId = await this.authTokens.consume(token, 'RESET_PASSWORD');
    if (!userId) return 'invalid';
    // The link proves the user controls the address, so it also verifies it.
    await this.users.setPasswordHash(userId, await argon2.hash(password), true);
    await this.sessions.revokeAllForUser(userId);
    return 'ok';
  }

  private async tokensFor(
    userId: string,
    familyId?: string,
  ): Promise<TokensResponse> {
    const { session, refreshToken } = await this.sessions.create(
      userId,
      this.refreshTtlDays,
      familyId,
    );
    const accessToken = await this.jwt.signAsync(
      { sub: userId, sid: session.id },
      { expiresIn: this.accessTtlSeconds },
    );
    return {
      accessToken,
      accessTokenExpiresIn: this.accessTtlSeconds,
      refreshToken,
    };
  }

  private async sendVerification(user: User): Promise<void> {
    const token = await this.authTokens.issue(user.id, 'VERIFY_EMAIL');
    await this.mail.sendVerification(
      user.email,
      user.displayName,
      `${this.publicUrl}/auth/verify?token=${token}`,
    );
  }

  private getDummyHash(): Promise<string> {
    this.dummyHash ??= argon2.hash('music-room-timing-equalizer');
    return this.dummyHash;
  }
}
