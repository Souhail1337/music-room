import { JwtService } from '@nestjs/jwt';
import request from 'supertest';
import { createTestApp, TestApp } from './support/app.js';

/** Covers every row of the I/O & edge-case matrix of spec A (Foundation + Accounts). */
describe('Auth (e2e)', () => {
  let t: TestApp;
  let seq = 0;
  const http = () => request(t.app.getHttpServer());
  const uniqueEmail = (tag: string) =>
    `${tag}.${Date.now()}.${++seq}@example.com`;
  const PASSWORD = 'correct horse battery';

  async function signup(email = uniqueEmail('user'), password = PASSWORD) {
    const res = await http()
      .post('/auth/signup')
      .send({ email, password, displayName: 'Yasmine' })
      .expect(201);
    return { email, password, ...(res.body as AuthBody) };
  }

  async function verifiedUser() {
    const user = await signup();
    await http()
      .get('/auth/verify')
      .query({ token: t.mail.lastLinkTo(user.email, '/auth/verify') })
      .expect(200);
    return user;
  }

  const bearer = (token: string) => ({ Authorization: `Bearer ${token}` });

  beforeAll(async () => {
    t = await createTestApp();
  });

  afterAll(async () => {
    await t.logs.flush();
    await t.app.close();
  });

  describe('platform', () => {
    it('GET /health answers {status:"ok"}', async () => {
      await http().get('/health').expect(200, { status: 'ok' });
    });

    it('GET /docs-json lists every auth route', async () => {
      const res = await http().get('/docs-json').expect(200);
      const paths = Object.keys(res.body.paths);
      for (const p of [
        '/auth/signup',
        '/auth/login',
        '/auth/google',
        '/auth/refresh',
        '/auth/logout',
        '/auth/forgot',
        '/auth/reset',
        '/auth/verify',
        '/auth/resend-verification',
        '/me',
        '/health',
      ]) {
        expect(paths).toContain(p);
      }
      expect(res.body.paths['/auth/signup'].post.requestBody).toBeDefined();
      expect(
        res.body.paths['/auth/signup'].post.responses['201'],
      ).toBeDefined();
    });

    it('unknown routes use the error shape', async () => {
      const res = await http().get('/does-not-exist').expect(404);
      expect(res.body).toMatchObject({
        code: 'NOT_FOUND',
        message: expect.any(String),
      });
    });

    it('protected routes need a token', async () => {
      const res = await http().get('/me').expect(401);
      expect(res.body.code).toBe('UNAUTHORIZED');
    });
  });

  describe('sign up', () => {
    it('creates an unverified account, issues a session and mails a verification link', async () => {
      const email = uniqueEmail('signup');
      const res = await http()
        .post('/auth/signup')
        .send({ email, password: PASSWORD, displayName: 'Yasmine' })
        .expect(201);
      expect(res.body).toMatchObject({
        user: { email, displayName: 'Yasmine', emailVerified: false },
        accessToken: expect.any(String),
        refreshToken: expect.any(String),
        accessTokenExpiresIn: 900,
      });
      expect(res.body.user).not.toHaveProperty('passwordHash');
      expect(t.mail.lastLinkTo(email, '/auth/verify')).toMatch(/^[\w-]{40,}$/);
      const stored = await t.prisma.user.findUniqueOrThrow({
        where: { email },
      });
      expect(stored.passwordHash).toMatch(/^\$argon2id\$/);
    });

    it('refuses a duplicate email (case-insensitive) with 409 EMAIL_TAKEN', async () => {
      const { email } = await signup();
      const res = await http()
        .post('/auth/signup')
        .send({
          email: email.toUpperCase(),
          password: PASSWORD,
          displayName: 'Again',
        })
        .expect(409);
      expect(res.body.code).toBe('EMAIL_TAKEN');
    });

    it('refuses a password shorter than 8 with 400 VALIDATION_FAILED and a field error', async () => {
      const res = await http()
        .post('/auth/signup')
        .send({
          email: uniqueEmail('weak'),
          password: 'short',
          displayName: 'W',
        })
        .expect(400);
      expect(res.body.code).toBe('VALIDATION_FAILED');
      expect(res.body.details.fields.password).toBeDefined();
    });

    it('refuses unknown fields', async () => {
      const res = await http()
        .post('/auth/signup')
        .send({
          email: uniqueEmail('extra'),
          password: PASSWORD,
          displayName: 'X',
          isAdmin: true,
        })
        .expect(400);
      expect(res.body.code).toBe('VALIDATION_FAILED');
    });
  });

  describe('email verification', () => {
    it('blocks an unverified user from non-auth routes with 403 EMAIL_NOT_VERIFIED', async () => {
      const user = await signup();
      const res = await http()
        .get('/me')
        .set(bearer(user.accessToken))
        .expect(403);
      expect(res.body.code).toBe('EMAIL_NOT_VERIFIED');
      // /auth/* stays reachable while unverified.
      await http()
        .post('/auth/resend-verification')
        .set(bearer(user.accessToken))
        .expect(202);
    });

    it('verifies through the link, then the link is single-use', async () => {
      const user = await signup();
      const token = t.mail.lastLinkTo(user.email, '/auth/verify');
      const ok = await http().get('/auth/verify').query({ token }).expect(200);
      expect(ok.headers['content-type']).toMatch(/text\/html/);
      expect(ok.text).toContain('You can return to the app');

      const me = await http()
        .get('/me')
        .set(bearer(user.accessToken))
        .expect(200);
      expect(me.body).toMatchObject({ email: user.email, emailVerified: true });

      const reused = await http()
        .get('/auth/verify')
        .query({ token })
        .expect(400);
      expect(reused.headers['content-type']).toMatch(/text\/html/);
      expect(reused.text).toContain('expired or was already used');
    });

    it('rejects an expired verification link (24h) with the HTML error page', async () => {
      const user = await signup();
      const token = t.mail.lastLinkTo(user.email, '/auth/verify');
      const row = await t.prisma.authToken.findFirstOrThrow({
        where: { user: { email: user.email }, type: 'VERIFY_EMAIL' },
      });
      expect(row.expiresAt.getTime() - row.createdAt.getTime()).toBeCloseTo(
        24 * 3600 * 1000,
        -4,
      );
      expect(row.tokenHash).not.toBe(token);
      await t.prisma.authToken.update({
        where: { id: row.id },
        data: { expiresAt: new Date(Date.now() - 1000) },
      });
      const res = await http().get('/auth/verify').query({ token }).expect(400);
      expect(res.text).toContain('expired or was already used');
      await http().get('/me').set(bearer(user.accessToken)).expect(403);
    });

    it('rejects a missing or unknown token', async () => {
      await http().get('/auth/verify').expect(400);
      await http().get('/auth/verify').query({ token: 'nope' }).expect(400);
    });

    it('resends a working link, retires the previous one, and sends nothing once verified', async () => {
      const user = await signup();
      const first = t.mail.lastLinkTo(user.email, '/auth/verify');
      const before = t.mail.sent.length;
      await http()
        .post('/auth/resend-verification')
        .set(bearer(user.accessToken))
        .expect(202);
      expect(t.mail.sent.length).toBe(before + 1);
      const second = t.mail.lastLinkTo(user.email, '/auth/verify');
      expect(second).not.toBe(first);
      await http().get('/auth/verify').query({ token: first }).expect(400);
      await http().get('/auth/verify').query({ token: second }).expect(200);

      await http()
        .post('/auth/resend-verification')
        .set(bearer(user.accessToken))
        .expect(202);
      expect(t.mail.sent.length).toBe(before + 1);
    });

    it('does not accept a token of the other kind', async () => {
      const user = await signup();
      const verifyToken = t.mail.lastLinkTo(user.email, '/auth/verify');
      await http()
        .get('/auth/reset')
        .query({ token: verifyToken })
        .expect(400);
      await http().post('/auth/forgot').send({ email: user.email }).expect(202);
      const resetToken = await vi.waitFor(() =>
        t.mail.lastLinkTo(user.email, '/auth/reset'),
      );
      await http().get('/auth/verify').query({ token: resetToken }).expect(400);
      await http().get('/me').set(bearer(user.accessToken)).expect(403);
    });
  });

  describe('login', () => {
    it('logs in with the right password', async () => {
      const user = await verifiedUser();
      const res = await http()
        .post('/auth/login')
        .send({ email: user.email, password: PASSWORD })
        .expect(200);
      expect(res.body.user.emailVerified).toBe(true);
      await http().get('/me').set(bearer(res.body.accessToken)).expect(200);
    });

    it('answers 401 INVALID_CREDENTIALS five times, then 429 RATE_LIMITED', async () => {
      const user = await verifiedUser();
      for (let i = 0; i < 5; i++) {
        const res = await http()
          .post('/auth/login')
          .send({ email: user.email, password: 'wrong-password' })
          .expect(401);
        expect(res.body.code).toBe('INVALID_CREDENTIALS');
      }
      const limited = await http()
        .post('/auth/login')
        .send({ email: user.email, password: 'wrong-password' })
        .expect(429);
      expect(limited.body.code).toBe('RATE_LIMITED');
      // The limit is per IP + account: another account from the same IP can still log in.
      const other = await verifiedUser();
      await http()
        .post('/auth/login')
        .send({ email: other.email, password: PASSWORD })
        .expect(200);
    });

    it('does not reveal whether the email exists', async () => {
      const res = await http()
        .post('/auth/login')
        .send({ email: uniqueEmail('ghost'), password: PASSWORD })
        .expect(401);
      expect(res.body.code).toBe('INVALID_CREDENTIALS');
    });
  });

  describe('sessions', () => {
    it('rotates the refresh token; reusing the old one revokes the whole family', async () => {
      const user = await verifiedUser();
      const first = await http()
        .post('/auth/refresh')
        .send({ refreshToken: user.refreshToken })
        .expect(200);
      expect(first.body.refreshToken).not.toBe(user.refreshToken);
      const second = await http()
        .post('/auth/refresh')
        .send({ refreshToken: first.body.refreshToken })
        .expect(200);
      await http().get('/me').set(bearer(second.body.accessToken)).expect(200);

      const reuse = await http()
        .post('/auth/refresh')
        .send({ refreshToken: user.refreshToken })
        .expect(401);
      expect(reuse.body.code).toBe('SESSION_REVOKED');

      // Every token of the family is dead now: refresh tokens and live access tokens.
      const after = await http()
        .post('/auth/refresh')
        .send({ refreshToken: second.body.refreshToken })
        .expect(401);
      expect(after.body.code).toBe('SESSION_REVOKED');
      const me = await http()
        .get('/me')
        .set(bearer(second.body.accessToken))
        .expect(401);
      expect(me.body.code).toBe('SESSION_REVOKED');

      // Other logins (families) of the same user are unaffected.
      const otherLogin = await http()
        .post('/auth/login')
        .send({ email: user.email, password: PASSWORD })
        .expect(200);
      await http()
        .get('/me')
        .set(bearer(otherLogin.body.accessToken))
        .expect(200);
    });

    it('lets at most one of N parallel refreshes rotate, and revokes the whole family', async () => {
      const user = await verifiedUser();
      const results = await Promise.all(
        Array.from({ length: 8 }, () =>
          http()
            .post('/auth/refresh')
            .send({ refreshToken: user.refreshToken }),
        ),
      );
      // The winner may still answer 200 if it finished before any loser arrived; its tokens are revoked either way.
      const ok = results.filter((r) => r.status === 200);
      expect(ok.length).toBeLessThanOrEqual(1);
      for (const r of ok) {
        await http().get('/me').set(bearer(r.body.accessToken)).expect(401);
      }
      for (const r of results.filter((r) => r.status !== 200)) {
        expect(r.status).toBe(401);
        expect(r.body.code).toBe('SESSION_REVOKED');
      }
      const familyRows = await t.prisma.session.findMany({
        where: { user: { email: user.email } },
      });
      // The original row plus exactly one rotated successor, and the losers' reuse revoked both.
      expect(familyRows).toHaveLength(2);
      expect(familyRows.every((row) => row.revokedAt !== null)).toBe(true);
    });

    it('logout ends the session on the server', async () => {
      const user = await verifiedUser();
      await http()
        .post('/auth/logout')
        .send({ refreshToken: user.refreshToken })
        .expect(204);
      const res = await http()
        .post('/auth/refresh')
        .send({ refreshToken: user.refreshToken })
        .expect(401);
      expect(res.body.code).toBe('SESSION_REVOKED');
      await http().get('/me').set(bearer(user.accessToken)).expect(401);
    });

    it('logout ends only that login; other devices stay signed in', async () => {
      const user = await verifiedUser();
      const other = await http()
        .post('/auth/login')
        .send({ email: user.email, password: PASSWORD })
        .expect(200);
      await http()
        .post('/auth/logout')
        .send({ refreshToken: user.refreshToken })
        .expect(204);
      await http().get('/me').set(bearer(other.body.accessToken)).expect(200);
      await http()
        .post('/auth/refresh')
        .send({ refreshToken: other.body.refreshToken })
        .expect(200);
    });

    it('issues 15-minute access tokens and answers 401 TOKEN_EXPIRED once one expires', async () => {
      const user = await verifiedUser();
      const jwt = t.app.get(JwtService);
      const claims = jwt.decode<{
        sub: string;
        sid: string;
        iat: number;
        exp: number;
      }>(user.accessToken);
      expect(claims.exp - claims.iat).toBe(900);
      const expired = await jwt.signAsync({
        sub: claims.sub,
        sid: claims.sid,
        exp: Math.floor(Date.now() / 1000) - 10,
      });
      const res = await http().get('/me').set(bearer(expired)).expect(401);
      expect(res.body.code).toBe('TOKEN_EXPIRED');
    });

    it('refuses an expired refresh token with 401 SESSION_EXPIRED', async () => {
      const user = await verifiedUser();
      const session = await t.prisma.session.findFirstOrThrow({
        where: { userId: user.user.id },
      });
      expect(session.expiresAt.getTime() - Date.now()).toBeCloseTo(
        30 * 86_400_000,
        -5,
      );
      await t.prisma.session.update({
        where: { id: session.id },
        data: { expiresAt: new Date(Date.now() - 1000) },
      });
      const res = await http()
        .post('/auth/refresh')
        .send({ refreshToken: user.refreshToken })
        .expect(401);
      expect(res.body.code).toBe('SESSION_EXPIRED');
    });

    it('rejects a tampered access token', async () => {
      const user = await verifiedUser();
      await http()
        .get('/me')
        .set(bearer(`${user.accessToken}x`))
        .expect(401);
    });
  });

  describe('password reset', () => {
    it('answers the same 202 for unknown and known emails, mailing only the known one', async () => {
      const user = await verifiedUser();
      const before = t.mail.sent.length;
      const unknown = await http()
        .post('/auth/forgot')
        .send({ email: uniqueEmail('nobody') })
        .expect(202);
      expect(t.mail.sent.length).toBe(before);
      const known = await http()
        .post('/auth/forgot')
        .send({ email: user.email })
        .expect(202);
      expect(known.body).toEqual(unknown.body);
      await vi.waitFor(() => t.mail.lastLinkTo(user.email, '/auth/reset'));
    });

    it('sets a new password, revokes every session and is single-use', async () => {
      const user = await verifiedUser();
      const secondLogin = await http()
        .post('/auth/login')
        .send({ email: user.email, password: PASSWORD })
        .expect(200);
      await http().post('/auth/forgot').send({ email: user.email }).expect(202);
      const token = await vi.waitFor(() =>
        t.mail.lastLinkTo(user.email, '/auth/reset'),
      );

      const form = await http().get('/auth/reset').query({ token }).expect(200);
      expect(form.text).toContain('<form');

      const newPassword = 'a brand new passphrase';
      const done = await http()
        .post('/auth/reset')
        .query({ token })
        .type('form')
        .send({ password: newPassword, confirm: newPassword })
        .expect(200);
      expect(done.text).toContain('Password changed');

      for (const refreshToken of [
        user.refreshToken,
        secondLogin.body.refreshToken,
      ]) {
        const r = await http()
          .post('/auth/refresh')
          .send({ refreshToken })
          .expect(401);
        expect(r.body.code).toBe('SESSION_REVOKED');
      }
      await http()
        .get('/me')
        .set(bearer(secondLogin.body.accessToken))
        .expect(401);
      await http()
        .post('/auth/login')
        .send({ email: user.email, password: PASSWORD })
        .expect(401);
      await http()
        .post('/auth/login')
        .send({ email: user.email, password: newPassword })
        .expect(200);

      const reused = await http()
        .post('/auth/reset')
        .query({ token })
        .type('form')
        .send({ password: 'yet another one', confirm: 'yet another one' })
        .expect(400);
      expect(reused.text).toContain('expired or was already used');
    });

    it('keeps the token usable after a too-short password', async () => {
      const user = await verifiedUser();
      await http().post('/auth/forgot').send({ email: user.email }).expect(202);
      const token = await vi.waitFor(() =>
        t.mail.lastLinkTo(user.email, '/auth/reset'),
      );
      const weak = await http()
        .post('/auth/reset')
        .query({ token })
        .type('form')
        .send({ password: 'short', confirm: 'short' })
        .expect(400);
      expect(weak.text).toContain('at least 8 characters');
      await http().get('/auth/reset').query({ token }).expect(200);
    });

    it('shows the form again when the two passwords differ, keeping the token usable', async () => {
      const user = await verifiedUser();
      await http().post('/auth/forgot').send({ email: user.email }).expect(202);
      const token = await vi.waitFor(() =>
        t.mail.lastLinkTo(user.email, '/auth/reset'),
      );
      const page = await http()
        .post('/auth/reset')
        .query({ token })
        .type('form')
        .send({ password: 'first passphrase', confirm: 'second passphrase' })
        .expect(400);
      expect(page.text).toContain('don’t match');
      expect(page.headers['cache-control']).toBe('no-store');
      await http().get('/auth/reset').query({ token }).expect(200);
      await http()
        .post('/auth/login')
        .send({ email: user.email, password: 'first passphrase' })
        .expect(401);
    });

    it('verifies the email of an unverified account, and retires older reset links', async () => {
      const user = await signup();
      await http().post('/auth/forgot').send({ email: user.email }).expect(202);
      const older = await vi.waitFor(() =>
        t.mail.lastLinkTo(user.email, '/auth/reset'),
      );
      await http().post('/auth/forgot').send({ email: user.email }).expect(202);
      const token = await vi.waitFor(() => {
        const latest = t.mail.lastLinkTo(user.email, '/auth/reset');
        expect(latest).not.toBe(older);
        return latest;
      });
      await http().get('/auth/reset').query({ token: older }).expect(400);

      const newPassword = 'a brand new passphrase';
      await http()
        .post('/auth/reset')
        .query({ token })
        .type('form')
        .send({ password: newPassword, confirm: newPassword })
        .expect(200);
      const login = await http()
        .post('/auth/login')
        .send({ email: user.email, password: newPassword })
        .expect(200);
      const me = await http()
        .get('/me')
        .set(bearer(login.body.accessToken))
        .expect(200);
      expect(me.body.emailVerified).toBe(true);
    });

    it('rejects an expired reset link (1h) with the HTML error page', async () => {
      const user = await verifiedUser();
      await http().post('/auth/forgot').send({ email: user.email }).expect(202);
      const token = await vi.waitFor(() =>
        t.mail.lastLinkTo(user.email, '/auth/reset'),
      );
      const row = await t.prisma.authToken.findFirstOrThrow({
        where: { user: { email: user.email }, type: 'RESET_PASSWORD' },
      });
      expect(row.expiresAt.getTime() - row.createdAt.getTime()).toBeCloseTo(
        3600 * 1000,
        -4,
      );
      await t.prisma.authToken.update({
        where: { id: row.id },
        data: { expiresAt: new Date(Date.now() - 1000) },
      });
      const page = await http().get('/auth/reset').query({ token }).expect(400);
      expect(page.text).toContain('expired or was already used');
      await http()
        .post('/auth/reset')
        .query({ token })
        .type('form')
        .send({ password: 'whatever123', confirm: 'whatever123' })
        .expect(400);
    });
  });

  describe('Google sign-in', () => {
    afterEach(() => {
      t.google.configured = true;
    });

    it('creates a verified user from a valid ID token, then finds the same user', async () => {
      const email = uniqueEmail('google');
      const idToken = `valid|sub-${seq}-${Date.now()}|${email}|Sam`;
      const first = await http()
        .post('/auth/google')
        .send({ idToken })
        .expect(200);
      expect(first.body.user).toMatchObject({
        email,
        displayName: 'Sam',
        emailVerified: true,
        hasGoogle: true,
      });
      await http().get('/me').set(bearer(first.body.accessToken)).expect(200);

      const second = await http()
        .post('/auth/google')
        .send({ idToken })
        .expect(200);
      expect(second.body.user.id).toBe(first.body.user.id);
    });

    it('rejects an invalid ID token with 401 GOOGLE_TOKEN_INVALID', async () => {
      const res = await http()
        .post('/auth/google')
        .send({ idToken: 'forged' })
        .expect(401);
      expect(res.body.code).toBe('GOOGLE_TOKEN_INVALID');
    });

    it('does not silently take over an existing email account', async () => {
      const user = await verifiedUser();
      const res = await http()
        .post('/auth/google')
        .send({ idToken: `valid|sub-x-${seq}|${user.email}|X` })
        .expect(409);
      expect(res.body.code).toBe('ACCOUNT_EXISTS');
    });

    it('answers 503 GOOGLE_NOT_CONFIGURED until client IDs are set', async () => {
      t.google.configured = false;
      const res = await http()
        .post('/auth/google')
        .send({ idToken: 'anything' })
        .expect(503);
      expect(res.body.code).toBe('GOOGLE_NOT_CONFIGURED');
    });
  });

  describe('action log', () => {
    it('writes one row per request with route, status, platform, device and app version', async () => {
      const user = await verifiedUser();
      const marker = `Pixel-e2e-${Date.now()}`;
      await http()
        .get('/me')
        .set(bearer(user.accessToken))
        .set('X-Platform', 'android')
        .set('X-Device', marker)
        .set('X-App-Version', '1.2.3')
        .expect(200);
      await http()
        .get('/me')
        .set('X-Platform', 'android')
        .set('X-Device', marker)
        .set('X-App-Version', '1.2.3')
        .expect(401);

      await vi.waitFor(async () => {
        await t.logs.flush();
        const rows = await t.prisma.actionLog.findMany({
          where: { device: marker },
          orderBy: { createdAt: 'asc' },
        });
        expect(rows).toHaveLength(2);
        expect(rows[0]).toMatchObject({
          userId: user.user.id,
          method: 'GET',
          route: '/me',
          status: 200,
          platform: 'android',
          appVersion: '1.2.3',
        });
        expect(rows[1]).toMatchObject({
          userId: null,
          route: '/me',
          status: 401,
        });
      });
    });
  });
});

interface AuthBody {
  user: { id: string; email: string; emailVerified: boolean };
  accessToken: string;
  refreshToken: string;
}
