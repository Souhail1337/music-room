---
title: 'A — Foundation + Accounts'
type: 'feature'
created: '2026-10-10'
status: 'done'
route: 'dispatch'
review_loop_iteration: 0
baseline_commit: '5265ee1b2bbbd405ea2cff74b9884bf980221dc0'
context:
  - '{project-root}/_bmad-output/planning-artifacts/architecture/architecture-music-room-2026-10-10/ARCHITECTURE-SPINE.md'
  - '{project-root}/_bmad-output/planning-artifacts/ux-designs/ux-music-room-2026-10-10/DESIGN.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** Nothing exists yet. Every service (Track Vote, Playlist, Profile) needs a running backend, a database, an Android app shell, and authenticated, verified users.

**Approach:** Scaffold the monorepo from the architecture spine (NestJS API + Prisma/Postgres + Mailpit via docker compose + Makefile, Expo app), then deliver PRD FR-1, FR-2, FR-4, FR-5, FR-22, FR-23 and NFR-1, 2, 4–8, 10, 13 end-to-end: email sign-up with verification, Google sign-in, password reset, sessions, configurable server URL, and a request log on every call.

## Boundaries & Constraints

**Always:** Follow spine AD-6 (one `issueSession`, 15-min JWT plus rotating hashed refresh token with family revoke, argon2, Google ID token verified on the server), AD-10 (global ActionLog interceptor, `X-Platform/X-Device/X-App-Version` headers), AD-11 (error shape `{code,message,details?}`, config only from env). Swagger at `/docs`. Throttling per the spine conventions. `.env` is git-ignored; `.env.example` is committed. Use the stack versions pinned in the spine. Use the dark theme tokens from DESIGN.md via react-native-paper.

**Never:** Event, Playlist, Friends or Profile-edit features (specs B–D). FR-3 Google account linking (spec D). Facebook login. Committing secrets or `node_modules`. Mutations over sockets. Building realtime in this spec (an empty `realtime` module stub is fine).

**Decisions:** Verification and reset links point to small HTML pages served by the API (`GET /auth/verify?token=`, `GET|POST /auth/reset?token=`), so the app needs no deep linking. The verification token lasts 24h; the reset token lasts 1h. Both are single-use and stored hashed. Google OAuth: build now, configure later (user decision) — client IDs come from `.env` / `app.config.ts`; until they're set, the Google button shows "Google sign-in isn't configured" and the API returns 503 `GOOGLE_NOT_CONFIGURED`; Google e2e tests mock ID-token verification.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Sign up | new email, pw ≥ 8 chars | 201; verification mail in Mailpit; app shows "Check your email" | — |
| Duplicate email | existing email | 409 `EMAIL_TAKEN` | snackbar message |
| Weak password | pw < 8 chars | 400 `VALIDATION_FAILED` | inline field error |
| Unverified access | valid JWT, unverified user, any non-auth route | 403 `EMAIL_NOT_VERIFIED` | app routes to "Check your email" |
| Verify link | valid token / reused or expired token | user verified, HTML "You can return to the app" / HTML error page | — |
| Login | wrong password ×6 in 1 min | 401 `INVALID_CREDENTIALS`, then 429 `RATE_LIMITED` | snackbar |
| Refresh rotation | old refresh token reused after a rotation | 401 `SESSION_REVOKED`; every session in that family revoked | app logs out |
| Forgot password | unknown or known email | identical 202 response | — |
| Reset | valid token + new pw | pw changed, all sessions revoked, token is single-use | expired → HTML error |
| Google | valid ID token / invalid one | user created or found (verified), session issued / 401 `GOOGLE_TOKEN_INVALID` | snackbar |
| Server down | wrong serverUrl | "Can't reach the server" screen with Retry and Settings | — |

</frozen-after-approval>

## Code Map

Greenfield. The only existing files are planning artifacts, `.gitignore` and `musicc.pdf`. Environment found: Node 23 and npm 11 locally (Docker images use Node 24); Docker installed but **the daemon isn't running**; Android SDK at `~/Library/Android/sdk` (platform 36.1, AVD `Medium_Phone`); system Java is 8, so Gradle must use Android Studio's bundled JBR (`/Applications/Android Studio.app/Contents/jbr`).

## Tasks & Acceptance

**Execution:**
- [x] `Makefile`, `docker-compose.yml`, `.env.example` -- `make install|up|down|test|db-migrate`; services api, postgres:18, mailpit -- NFR-13
- [x] `apps/api/` -- `nest new` scaffold (npm), with ConfigModule, global ValidationPipe, exception filter, ThrottlerGuard, Swagger `/docs`, `/health` -- AD-11, NFR-1/2/5
- [x] `apps/api/prisma/schema.prisma` -- User, Session(familyId, tokenHash, revokedAt), AuthToken(type verify/reset, tokenHash, expiresAt, usedAt), ActionLog; initial migration -- AD-6, AD-10
- [x] `apps/api/src/auth/*` -- signup, login, google, refresh, logout, forgot, reset, verify (plus HTML pages), `EmailVerifiedGuard`, `JwtAuthGuard` (global, `@Public()` opt-out), mail service (nodemailer → Mailpit) -- FR-1,2,4,5
- [x] `apps/api/src/users/*` -- `GET /me` (minimal; full profile is in spec D) -- remote-control smoke endpoint
- [x] `apps/api/src/logs/*` -- global ActionLog interceptor -- AD-10
- [x] `apps/api/test/auth.e2e-spec.ts` -- every row of the I/O matrix, including refresh reuse and parallel refresh -- NFR-14
- [x] `apps/mobile/` -- `create-expo-app` (expo-router, TS) + expo-dev-client, react-native-paper dark theme, secure-store, `src/api` http client (serverUrl, X-* headers, auto-refresh), auth screens from EXPERIENCE.md IA, a 4-tab shell with placeholders, Settings (Server URL + Test connection, Log out), long-press on the Welcome logo → Server URL -- FR-22, FR-23, UX

**Acceptance Criteria:**
- Given a fresh clone with Docker running, when `cp .env.example .env && make up`, then the API answers `/health` and `/docs` lists every auth route with inputs and outputs.
- Given any API request from the app, when it completes, then one ActionLog row exists with route, status, platform, device and app version.
- Given the app on the emulator pointed at the host IP, when a user signs up, verifies through the Mailpit link and logs in, then they land on the Discover tab, and they stay logged in after the app restarts.
- Given `git status` after the work, then no `.env` and no `node_modules` are tracked.

## Implementation Notes

- **Node 24 on the host.** Prisma 7 refuses Node 23 (`npm install` aborts), so the host-side commands (`make install|test|lint`, `npm run test:e2e`) need Node 24 (`.nvmrc`). `make check-node` prints a clear message. `nest new` itself crashes on Node 23 (`ERR_REQUIRE_CYCLE_MODULE`); the scaffold was generated in a `node:24` container.
- **Nest 12 scaffold is ESM + Vitest + oxlint** (`"type": "module"`, `.js` import suffixes). Prisma 7 uses the `prisma-client` generator (ESM, output `src/generated/prisma`, git-ignored) with `@prisma/adapter-pg` and `prisma.config.ts` (reads `apps/api/.env` then the root `.env`). `prisma` and `dotenv` are runtime deps so the container can run `prisma migrate deploy` at start.
- **ActionLog is written by global middleware, not a Nest interceptor.** Interceptors never run for requests rejected by guards (401/403/429) or unmatched routes, which would break "one ActionLog row per request". The class (`logs/action-log.interceptor.ts`) is applied to every route in `AppModule.configure` and writes on `res.finish`. Swagger assets and the container health probe (`X-Internal-Probe: 1` on `/health`) are skipped.
- **Sessions.** One `Session` row per refresh token; rotation marks the row `rotatedAt` and creates a successor with the same `familyId`. The rotation is a conditional `UPDATE … WHERE rotatedAt IS NULL`, so of N parallel refreshes with the same token exactly one wins; the losers are treated as reuse (401 `SESSION_REVOKED`, family revoked). The app's HTTP client single-flights refreshes so it never races itself. `JwtAuthGuard` checks the access token's `sid` row on every request, so logout / reset / family revoke take effect immediately (401 `SESSION_REVOKED`).
- **Rate limits.** Global 100/min per IP (`THROTTLE_LIMIT`). `@AuthThrottle()` routes (signup, login, google, forgot, resend-verification, reset GET/POST) add 5/min per IP + account (email, link token or bearer), per route (`AUTH_THROTTLE_LIMIT`). Refresh/logout/verify only use the global limit. The e2e setup raises the global limit, keeps the auth one.
- **Error codes added beyond the matrix:** `UNAUTHORIZED`, `TOKEN_EXPIRED`, `SESSION_EXPIRED`, `ACCOUNT_EXISTS` (Google sign-in with an email that already has a password account — linking is FR-3/spec D, so it is refused, not merged), `NOT_FOUND`, `INTERNAL_ERROR`.
- **Signup and login of an unverified user both issue a session**, so the app can call `/auth/resend-verification` and re-check `/me` ("I've verified"). A successful password reset also marks the email verified (the link proves ownership).
- **E2E tests** use a separate `musicroom_test` database (`TEST_DATABASE_URL`, migrated and truncated by the Vitest global setup), capture mail in memory instead of Mailpit, and mock Google ID-token verification. Mailpit delivery was checked by hand against the compose stack (signup → Mailpit API → verify link → login → `/me`).
- **Mobile.** Routes live in `apps/mobile/app/` (spine seed), other code in `src/`. Expo Router `Stack.Protected` guards switch between `(auth)`, `check-email`, `(tabs)` and `unreachable` from the session state the server reports. Google sign-in is only usable in a dev build and when `GOOGLE_WEB_CLIENT_ID` is set in `apps/mobile/.env`; the google-signin config plugin is only added when `GOOGLE_IOS_URL_SCHEME` is set (Android needs no plugin without Firebase). Cleartext HTTP is allowed through `expo-build-properties` for the LAN demo.
- Facebook is left off the Welcome screen (Never list). Settings shows Server URL + Log out only (linked accounts are spec D).

## Spec Change Log

## Review Triage Log

Review pass 1 (2026-10-10, re-run after the move to `~/Desktop/Work/music-room`). Layers: blind-hunter (BH), edge-case-hunter (EC), verification-gap (VG). No intent_gap / bad_spec entries → no loopback.

| ID | Finding | Verdict | Route | Evidence |
|----|---------|---------|-------|----------|
| EC1 + EC25 | Parallel refresh: a loser can revoke the family before the winner inserts its successor, so the successor survives | medium | patch | `rotate` claim → `tokensFor` create was not re-checked. Fixed: `SessionsService.confirmRotation` re-reads the rotated row after the successor exists and revokes the family if a loser got there first; e2e now asserts every family row is revoked |
| BH2 + EC20 | `boot()` sets `booting`, which unmounts the whole navigator (blank screen on Retry / Server URL save; `router.back()` on a torn-down stack) | medium | patch | `RootNavigator` returns null on `booting`, splash already hidden. Fixed: `boot` no longer sets `booting` (only the initial state is) |
| BH4 | Earlier unused verify/reset links stay valid after Resend / a second Forgot | medium | patch | `AuthTokensService.issue` never retired older rows. Fixed: issue marks earlier unused tokens of that type used; e2e covers older reset link → 400 |
| VG1 | 15-min access TTL and `TOKEN_EXPIRED` untested | medium | patch | Pre-verified gap. Added e2e: `exp - iat === 900`, expired JWT → 401 `TOKEN_EXPIRED` |
| VG2 + BH11a | `SESSION_EXPIRED` refresh path untested | medium | patch | Pre-verified gap. Added e2e: 30-day `expiresAt`, expired session → 401 `SESSION_EXPIRED` |
| VG3 | Resend-verification only checked for 202 | medium | patch | Pre-verified gap. Added e2e: new mail, new link works, old link retired, nothing sent once verified |
| VG6 + BH11b | Real `GoogleVerifierService` never exercised (always faked) | medium | patch | Pre-verified gap. Added `google-verifier.service.spec.ts`: audience list, `email_verified`, error → null, name fallback |
| VG4 | "Reset also verifies the email" untested | low | patch | Pre-verified gap. Added e2e reset from an unverified signup → `/me` 200 `emailVerified: true` |
| VG5 + BH11c | Reset password/confirm mismatch untested | low | patch | Pre-verified gap. Added e2e: mismatch → 400 form, token still usable, password unchanged |
| VG7 | Logout scope (one family) unpinned | low | patch | Pre-verified gap. Added e2e: second login survives the first one's logout |
| BH11d | Verify token used as reset token (and reverse) untested | low | patch | `peek`/`consume` check `type`; added e2e for both directions |
| BH3 | Email links use `API_PUBLIC_URL=localhost`, useless when opened on a phone | low | patch | Default is fine for the host's Mailpit UI (the AC flow); added a `.env.example` note for the LAN-IP case |
| BH6 + EC14 | Signup awaits mail; nodemailer default timeouts outlast the app's 10s abort | low | patch | Transport had no timeouts. Set connection/greeting/socket timeouts to 5s |
| EC13 | `SMTP_PORT` non-numeric → NaN port | low | patch | `Number(...)`; now `intEnv(..., 1025)` |
| EC12 | `intEnv('15abc')` → 15 | low | patch | `parseInt` partial parse; now digits-only |
| EC9 + EC24 | Client-aborted requests leave no ActionLog row | low | patch | Only `finish` was observed. Now `close` (fires on both), status 499 if not finished |
| EC10 | `/` not matched by `*path`, so it is never logged | low | patch | path-to-regexp v8 needs a segment; now `{*path}`; checked: `GET /` → row `(unmatched) 404` |
| EC11 | Reset form posts to absolute `/auth/reset`, wrong behind a path prefix | low | patch | Form now has no `action` (posts to its own URL, token included) |
| BH15 | Token pages sent without `Cache-Control`/`Referrer-Policy` | low | patch | Added `no-store` + `no-referrer` to all three HTML responses; checked with curl and e2e |
| EC19 | `HTTP://host` rejected by Server URL form | low | patch | `normalizeServerUrl` accepts any case, `valid` regex didn't; added `/i` |
| EC22 | Avatar initial splits a surrogate pair | low | patch | `.slice(0,1)`; now `Array.from(...)[0]` |
| BH16a | API scaffold leftovers (`deploy` script, `@nestjs/mau`, `nest g library` comment) | low | patch | Removed |
| VG8 + BH11e | Mobile `ApiClient` refresh/single-flight and `AuthProvider` have no tests | medium | defer | Pre-verified gap; app has no test runner yet — adding one is outside this change |
| BH9 | Per-IP throttling may see one IP (Docker Desktop gateway) for every client | maybe-false | defer | Unverified (would be medium): needs a check of `req.ip` from two LAN devices against the compose API |
| BH1 | A lost refresh response (client 10s abort after server rotation) logs the user out | low | reject | Real but rare on LAN; only fix is a reuse grace window, which weakens the frozen AD-6 family-revoke rule |
| BH5 | Unverified accounts squat an email forever | false | reject | Owner recovers via Forgot password: reset sets the password, verifies the email and revokes the squatter's sessions |
| BH7 | Signup can mail arbitrary inboxes (auth throttle keyed by IP+email) | low | reject | Bounded by the 100/min global limit on a LAN demo; per-IP signup limit adds a throttler |
| BH8 | `JWT_ACCESS_SECRET` placeholder/length not enforced | low | reject | Enforcing it under `NODE_ENV=production` breaks the AC `cp .env.example .env && make up` |
| BH10a | ActionLog writes in flight at shutdown may be dropped | low | reject | Few rows at SIGTERM; a correct fix depends on Nest destroy-hook ordering vs Prisma disconnect (adds lifecycle code) |
| BH10b | No retention for sessions / auth_tokens / action_logs | low | reject | No harm at demo scale; a retention job is new surface (fits spec E SECURITY.md) |
| BH12 | "Check your email" shows "your address" after a restart | low | reject | Cosmetic; un-guarding `/me` would break the matrix's 403 `EMAIL_NOT_VERIFIED` contract the app relies on |
| BH13 + EC7 | Forgot-password timing differs for known emails | low | reject | Signup's `EMAIL_TAKEN` already discloses existence; fire-and-forget DB write would make tests racy |
| BH14a | API image runs as root | low | reject | Local demo container; no exposed attack surface beyond the API |
| BH14b | `axllent/mailpit:latest` unpinned | false | reject | Spine pins Mailpit as `latest` |
| BH14c | Postgres published on 0.0.0.0 with default creds | low | reject | Dev compose; host-side and containerised test runs connect to it |
| BH14d | `x-internal-probe` header can be spoofed | low | reject | Only effect: a client hides its own `/health` hits from the log |
| BH16b | Unused mobile deps (`@expo/ui`, `expo-glass-effect`, …) | low | reject | Template deps; removing them touches the lockfile and native build for no user-visible gain |
| BH16c | `ActionLogInterceptor` is middleware, name misleads | low | reject | Name and file follow the spine/spec (AD-10, Code Map); docstring explains why |
| EC2 | Concurrent first Google sign-in → `ACCOUNT_EXISTS` | low | reject | Needs a double submit; button is disabled while busy; fix adds a P2002 branch |
| EC3 | Extra query params on email links → JSON 400 | low | reject | Mailpit/mail clients don't append params to these links; fix adds per-handler query parsing |
| EC4 | POST /auth/reset with missing fields → JSON 400 | false | reject | The HTML form marks both fields `required`; only non-browser clients get the JSON error, which is correct |
| EC5 | Reset with >128 chars says "at least 8" | low | reject | The form's `maxlength=128` prevents it |
| EC6 | Reset not transactional (token burned if a later write fails) | low | reject | Needs a DB failure mid-request; fix spans services in a transaction |
| EC8 | Throttle keys: Google per-IP only; resend keyed by bearer that changes on refresh | low | reject | Per spec's IP+account rule; Google has no account key; resend only mails the user's own address |
| EC15 | Logout during an in-flight refresh can write tokens back | low | reject | Needs a tap during a refresh; next start hits 401 → cleared; fix adds an epoch |
| EC16 | `api.load()` throwing leaves the app booting | low | reject | SecureStore read failure not demonstrated; guard for undemonstrated state |
| EC17 | Body stall after headers hangs (timer cleared before `text()`) | low | reject | Our API never stalls bodies; fix restructures the client |
| EC18 | 2xx non-JSON body returned as `undefined` | low | reject | Boot and Test connection both require `/health` → `{status:"ok"}` first |
| EC21 | Forgot-password VALIDATION_FAILED without an `email` field shows nothing | false | reject | `ForgotPasswordDto` has only `email`, so every VALIDATION_FAILED carries it |
| EC23 | Mail scanners prefetching GET /auth/verify consume the token | low | reject | GET verify is a frozen Decision; the scanner only reaches the owner's mailbox, so ownership still holds |

## Verification

**Commands:**
- `make up && curl -s localhost:3000/health` -- expected: `{"status":"ok"}`
- `cd apps/api && npm run test:e2e` -- expected: all auth e2e tests pass (Postgres from compose)
- `cd apps/api && npm run lint && npm run build` -- expected: clean
- `cd apps/mobile && npx tsc --noEmit` -- expected: clean

**Manual checks:**
- Run the Android dev build on `Medium_Phone` (`npx expo run:android`): sign-up → Mailpit (http://localhost:8025) link → log in → tabs; Settings → Server URL test.
