# Security — Music Room

This file covers NFR-9: the threats we expect and the protection the project has against each one. Each protection links to the code that implements it. Where a threat is only partly covered, the residual risk says what is left and why we accepted it.

Scope: the local/demo deployment described in the architecture. That is one API container, PostgreSQL and Mailpit on a developer machine, with Android phones on the same LAN. Production hosting and TLS are out of scope (see [Out of scope](#out-of-scope)).

## Summary

| # | Threat | Main protection | Code |
| --- | --- | --- | --- |
| 1 | Stolen or replayed session | 15-min JWT + rotating refresh tokens; a reused token revokes the whole family | [`sessions.service.ts`](../apps/api/src/auth/sessions.service.ts), [`auth.service.ts`](../apps/api/src/auth/auth.service.ts) |
| 2 | Tokens read on the device | `expo-secure-store` (Android Keystore) | [`storage.ts`](../apps/mobile/src/api/storage.ts) |
| 3 | Password brute force and account discovery | argon2 hashes, per-IP+account rate limit, same answer for unknown emails | [`throttler.config.ts`](../apps/api/src/common/guards/throttler.config.ts), [`auth.service.ts`](../apps/api/src/auth/auth.service.ts) |
| 4 | Reading or changing data you shouldn't | Global auth guards + one access policy for REST and sockets (AD-4) | [`access.service.ts`](../apps/api/src/access/access.service.ts), [`jwt-auth.guard.ts`](../apps/api/src/auth/jwt-auth.guard.ts) |
| 5 | Private profile fields leaking | Responses are built by `ProfileView.for(viewer, target)` (AD-7) | [`user.view.ts`](../apps/api/src/users/user.view.ts) |
| 6 | Location spoofing for `on_site` events | Server-side check of the time window and distance, in UTC (AD-5) | [`access.service.ts`](../apps/api/src/access/access.service.ts) |
| 7 | Deezer API abuse | Backend-only proxy, 10-min cache, strict IDs, timeouts, global rate limit (AD-8) | [`music.service.ts`](../apps/api/src/music/music.service.ts), [`deezer.client.ts`](../apps/api/src/music/deezer.client.ts) |
| 8 | WebSocket flooding / eavesdropping | Authenticated handshake, receive-only channel, `canView` on join | [`realtime.gateway.ts`](../apps/api/src/realtime/realtime.gateway.ts), [`realtime.service.ts`](../apps/api/src/realtime/realtime.service.ts) |
| 9 | Request flooding (HTTP) | `@nestjs/throttler`: 100 req/min per IP | [`throttler.config.ts`](../apps/api/src/common/guards/throttler.config.ts), [`app.module.ts`](../apps/api/src/app.module.ts) |
| 10 | Injection and malformed input | Whitelisting `ValidationPipe`, Prisma parameterized queries only | [`validation.ts`](../apps/api/src/common/validation.ts) |
| 11 | Lost updates from concurrent writes | DB constraints and row locks (AD-2, AD-3, AD-9) | [`events.repository.ts`](../apps/api/src/events/events.repository.ts), [`playlists.service.ts`](../apps/api/src/playlists/playlists.service.ts) |
| 12 | Secrets committed to git | `.env` git-ignored, gitleaks in pre-commit and CI | [`.gitignore`](../.gitignore), [`.githooks/pre-commit`](../.githooks/pre-commit), [`ci.yml`](../.github/workflows/ci.yml) |
| 13 | Leaky email links | Single-use hashed tokens with expiry; `no-store` and `no-referrer` on link pages | [`auth-tokens.service.ts`](../apps/api/src/auth/auth-tokens.service.ts), [`auth.controller.ts`](../apps/api/src/auth/auth.controller.ts) |
| 14 | Untraceable abuse | One ActionLog row per request (user, route, status, IP, platform, device, app version) | [`action-log.interceptor.ts`](../apps/api/src/logs/action-log.interceptor.ts) |
| 15 | Demo stack exposed on the LAN | Run it only on a trusted network; bind Postgres and Mailpit to `127.0.0.1` | [`docker-compose.yml`](../docker-compose.yml) |

## Threats and protections

### 1. Stolen or replayed session (AD-6, NFR-6)

**Threat.** Someone gets a copy of a user's tokens, for example from a backup, a rooted phone or a leaked log, and uses the account.

**Protections**
- **One way to create a session.** Every login path, email/password and Google, ends in `AuthService.issueSession`.
- **Short-lived access token.** The JWT lasts 15 minutes (`JWT_ACCESS_TTL_SECONDS`). On every request, `JwtAuthGuard` checks that the session behind the token's `sid` still exists and hasn't been revoked. Logging out or resetting the password takes effect immediately, not when the JWT expires.
- **Rotating refresh tokens.** The refresh token is opaque and only its SHA-256 hash is stored. Using it rotates it. Presenting an already-rotated token revokes the whole family (`SessionsService.rotate` → `revokeFamily`). If an attacker and the real user both hold the same token, the second one to use it ends the session for both.
- **Password reset ends every session** of the user.
- **Google ID tokens are verified on the server** with `google-auth-library`, for our client ID only ([`google-verifier.service.ts`](../apps/api/src/auth/google-verifier.service.ts)). The app never sends profile data from Google.

**Residual risk.** A stolen access token works for at most 15 minutes, or until the session is revoked.

### 2. Token storage on the device (NFR-9 example)

**Threat.** Another app, or someone with the unlocked phone, reads the tokens.

**Protections**
- **Secure storage.** Access and refresh tokens, and the server URL, are kept only in `expo-secure-store`, which is backed by the Android Keystore ([`storage.ts`](../apps/mobile/src/api/storage.ts)). They are never in AsyncStorage, logs or the React Query cache.
- **Logout clears them.** Logout deletes the tokens locally (`clearTokens`) and revokes the family on the server.
- **Ended sessions sign the app out.** If refresh is refused (revoked or expired), the app clears its tokens and goes back to sign-in ([`client.ts`](../apps/mobile/src/api/client.ts), tested in `src/api/__tests__/client.test.ts`).

**Residual risk.** A rooted device can read the Keystore. Server-side revocation (threat 1) limits the damage.

### 3. Brute force and account discovery (NFR-5, FR-4)

**Protections**
- **Strong hashing.** Passwords are hashed with argon2id (`argon2` defaults) and must have at least 8 characters.
- **Rate limits.**
  - Every `/auth/*` route that takes a password, email or link token is limited to `AUTH_THROTTLE_LIMIT` = 5 requests/min per IP+account, where the account is a hash of the email, link token or bearer token ([`throttler.config.ts`](../apps/api/src/common/guards/throttler.config.ts)).
  - The global limit of 100 requests/min per IP applies on top.
- **No account discovery.**
  - Login always runs one argon2 verification, against a dummy hash when the email is unknown. Unknown emails and wrong passwords take the same time and return the same `INVALID_CREDENTIALS`.
  - `/auth/forgot` returns the same answer for unknown emails.
- **Verified email required.** Until the email is verified, `EmailVerifiedGuard` blocks every service endpoint with `EMAIL_NOT_VERIFIED`.

**Residual risk.**
- The limits are per IP, and behind Docker Desktop's port forwarding every LAN device may look like the same IP (tracked in `deferred-work.md`). Real phones could then share one limit, which hurts availability but doesn't weaken protection.
- argon2 is deliberately expensive: the load test measured about 6 logins/s on the demo machine (see [LOADTEST.md](LOADTEST.md)). A login flood is therefore mostly a CPU-exhaustion risk, which the per-IP limit caps.

### 4. Broken access control (AD-4, NFR-4)

**Protections**
- **Every route is authenticated by default.** Three global guards are registered in [`app.module.ts`](../apps/api/src/app.module.ts): throttler, `JwtAuthGuard`, then `EmailVerifiedGuard`. A route is public only if it opts out with `@Public()`. Only `/auth/*` and `/health` do.
- **Swagger UI is also public.** `/docs` and `/docs-json` are served by `SwaggerModule` outside the guarded controllers ([`app.setup.ts`](../apps/api/src/app.setup.ts)). This is acceptable because they describe the API (routes, DTOs, error codes) and return no data. Every endpoint they list still requires a token.
- **One access policy.**
  - [`AccessService`](../apps/api/src/access/access.service.ts) holds the `canView` and `canAct` rules for events and playlists. The REST services and the socket `join` handler both use it.
  - A private resource you can't view returns **404**, so you can't tell it exists.
  - A refused action returns **403** with a reason code: `NOT_INVITED`, `OUTSIDE_AREA`, `OUTSIDE_TIME_WINDOW` or `READ_ONLY`.
  - Host- and owner-only routes check ownership (`NOT_HOST`, `NOT_OWNER`).
- **Changes kick out live viewers.** When visibility or invites change, `RealtimeService.reauthorize` removes from the room any socket that can no longer view it.
- **Tested.** The e2e suites (`apps/api/test/events.e2e-spec.ts`, `playlists.e2e-spec.ts`, `profile-friends.e2e-spec.ts`) cover 401, 403 and the private 404.

### 5. Profile privacy (AD-7, FR-7)

**Protections**
- **One way out for user data.** It leaves the API only through `ProfileView.for(viewer, target)` ([`user.view.ts`](../apps/api/src/users/user.view.ts)).
  - It always returns the public section.
  - It adds the friends section only when the viewer and target are friends, and the private section only for yourself.
  - Hidden sections are absent, not `null`. The email is never included.
- **Separate storage.** The sections are stored as separate JSON columns, so a missed filter can't leak one field at a time.
- **Tested** in `user.view.spec.ts`.

### 6. Location spoofing for `on_site` events (AD-5, NFR-9 example)

**Threat.** A user who is not at the party fakes their GPS position to vote.

**Protections**
- **The server decides.**
  - Vote and suggest requests on an on-site event must carry `{lat, lng}`; without them the request fails with `LOCATION_REQUIRED`.
  - The server checks the time window first (`startsAt`/`endsAt`, stored and compared in UTC), then the haversine distance to the venue against `radiusM` ([`access.service.ts`](../apps/api/src/access/access.service.ts)).
  - The app never decides whether a user is on site.
- **Narrow window.** Outside the time window, even a perfect spoof is refused. The host can also use the `invited` license instead.
- **Accountable.** Every vote is tied to an account, and every request is logged with its IP and device (threat 14).

**Residual risk.**
- A client can always send any coordinates, and an Android mock-location app makes this easy.
- Stronger checks are not implemented: Play Integrity attestation, Wi-Fi or BLE proof of presence, or rejecting `mocked` positions on the client.
- The impact is limited to votes in one event. For a party, the time window plus accountability is a proportionate answer.

### 7. Deezer API abuse (AD-8, NFR-9 example)

**Threat.** Clients use our backend to hammer Deezer and get our IP rate-limited or banned, or they inject fake track data.

**Protections**
- **The backend is the only Deezer client.** Only [`deezer.client.ts`](../apps/api/src/music/deezer.client.ts) talks to `api.deezer.com`. The app never calls Deezer directly.
- **Search is cached.** Results are cached in memory for 10 minutes and normalized by query, with a cap of 500 entries ([`music.service.ts`](../apps/api/src/music/music.service.ts)). In the load test, every search after the first was served from the cache.
- **Tracks are fetched once.** A track is fetched from Deezer only the first time it is used, then read from the `tracks` table.
- **Strict IDs.** Track IDs must match `^\d{1,20}$`. Titles and artists always come from Deezer, never from the client, so nobody can plant fake track names.
- **Timeouts.** Each Deezer call has a 5 s timeout. An outage becomes `503 MUSIC_UNAVAILABLE` instead of hanging requests.
- **Preview URLs are never stored.** They are fetched fresh for the host just before playback.
- **Global per-IP rate limit** (threat 9).

**Residual risk.** Many accounts sending many different search queries would bypass the cache. The per-IP limit is the only cap.

### 8. WebSocket flooding and eavesdropping (AD-1, NFR-9 example)

**Threat.** A client opens many sockets, joins rooms it shouldn't see, or floods the gateway with messages.

**Protections**
- **Authenticated handshake.** Every connection must present a valid access token whose session is live and whose email is verified. The handshake middleware runs the same checks as the HTTP guards ([`realtime.gateway.ts`](../apps/api/src/realtime/realtime.gateway.ts)).
- **Receive-only channel.** The socket accepts only `join` and `leave` (AD-1). All mutations go through REST, where validation, access checks and rate limits apply. Flooding the socket can't change any state.
- **`join` is checked.** It accepts only well-formed room names (`event:<uuid>`, `playlist:<uuid>`) and calls the domain's `canView`, so private rooms answer `NOT_FOUND`.
- **Small messages.** Socket.IO's default 1 MB `maxHttpBufferSize` caps the size of a single message.

**Residual risk.**
- There is no per-socket message rate limit and no per-user connection cap, because `@SkipThrottle` is set on the gateway.
- A logged-in user could spam `join` requests. Each one costs one access-check query.
- Next step if needed: a token bucket per socket in the gateway, and a cap on sockets per user.

### 9. HTTP request flooding

**Protections**
- **Rate limit.** `ThrottlerGuard` is global: `THROTTLE_LIMIT` = 100 requests/min per IP, plus the stricter auth limit (threat 3).
- **Small bodies.** Express's default JSON body limit is 100 kB.
- **Paginated lists.** List endpoints are paginated (`{ items, nextCursor }`), and user search returns at most 20 results.

**Residual risk.** A single API process on one machine can't withstand a distributed flood. A reverse proxy or WAF would be the answer in production (see [Out of scope](#out-of-scope)).

### 10. Injection and malformed input (NFR-7)

**Protections**
- **Validation.**
  - The global `ValidationPipe` uses `whitelist` and `forbidNonWhitelisted`, so unknown fields are refused, not ignored ([`validation.ts`](../apps/api/src/common/validation.ts)).
  - Every DTO bounds its strings, numbers and enums.
  - Errors come back as `400 VALIDATION_FAILED` with per-field details.
- **Parameterized queries.** All database access goes through Prisma.
  - The few hand-written statements (row locks, `ON CONFLICT DO NOTHING`, advisory locks) use the tagged-template `$queryRaw` and `$executeRaw`. Prisma sends every interpolated value as a bind parameter.
  - There is no `$queryRawUnsafe` or `$executeRawUnsafe` in the code.
- **Escaped link pages.** The HTML pages served for email links ([`auth-pages.ts`](../apps/api/src/auth/auth-pages.ts)) are static templates and don't echo user input.

### 11. Concurrency abuse: double votes, lost updates (AD-2, AD-3, AD-9)

**Protections**
- **Votes.** A vote is unique per `(userId, suggestionId)`. It is written with `INSERT … ON CONFLICT DO NOTHING`, and the counter moves by ±1 only when a row actually changed.
- **Playlist edits.** They take the playlist row lock (`FOR UPDATE`) and must carry the current `baseVersion`. A stale edit gets **409 `VERSION_CONFLICT`** with the current state.
- **Now Playing.** It advances only through `POST /events/:id/advance {expectedNowPlayingId}`.
- **Tested.** These rules are covered by `apps/api/test/concurrency/*.e2e-spec.ts`. The load test also exercises them under load: thousands of edits, with the 409s counted separately.

### 12. Secrets in the repository (NFR-8)

**Protections**
- **Config comes only from env** through `ConfigModule` (AD-11).
  - `.env` is git-ignored ([`.gitignore`](../.gitignore)), and `.env.example`, with dev-only placeholder values, is the only env file in git.
  - The API refuses to start without `DATABASE_URL` and `JWT_ACCESS_SECRET` ([`env.validation.ts`](../apps/api/src/common/config/env.validation.ts)).
- **Pre-commit scan.** The hook [`.githooks/pre-commit`](../.githooks/pre-commit) runs `gitleaks git --pre-commit --staged`. Enable it once per clone with `make hooks`.
- **CI scan.** The `secrets` job in [`ci.yml`](../.github/workflows/ci.yml) scans the full history with gitleaks on every push and pull request.
  - It runs after the push, so a leaked secret is already in the remote history by the time CI flags it. CI detects the leak; it doesn't prevent it.
  - It blocks a merge only if branch protection requires the `secrets` check.
  - The pre-commit hook is the only check that stops a secret before it leaves the machine.
- **If a secret leaks:**
  1. Rotate it first. Treat it as compromised from the moment it was pushed.
  2. Then remove it from history, for example with `git filter-repo`, and force-push. Every clone and fork still holds the old commits, which is why rotating comes first.
- **One documented false positive.** [`.gitleaks.toml`](../.gitleaks.toml) extends the default rules and allowlists only `_bmad/_config/files-manifest.csv`, whose SHA-256 file hashes look like API keys.

**Note.** The `JWT_ACCESS_SECRET` in `.env.example` is a dev placeholder. Any real deployment must replace it (`openssl rand -base64 48`).

### 13. Email link tokens

**Protections**
- **Single-use, expiring links.** Verification links are valid for 24 h and reset links for 1 h. Only a hash of each token is stored ([`auth-tokens.service.ts`](../apps/api/src/auth/auth-tokens.service.ts)).
- **No caching or referrer leaks.** The link pages are sent with `Cache-Control: no-store` and `Referrer-Policy: no-referrer`, so the token doesn't end up in caches or `Referer` headers.
- **Reset is rate-limited.** The reset form and its POST have the auth rate limit.

### 14. Repudiation and investigation (NFR-10, AD-10)

**Protections**
- **One log row per request.** A global middleware ([`action-log.interceptor.ts`](../apps/api/src/logs/action-log.interceptor.ts)) writes one `action_logs` row per API request. It records the user, method, route, status, duration, IP, and the app's `X-Platform`, `X-Device` and `X-App-Version` headers.
- **Refused requests are logged too.** This includes requests refused by guards (401, 403, 429), so abuse is visible.

### 15. Demo stack exposed on the local network

**Threat.** `docker-compose.yml` publishes every port on all interfaces, not only the API's. On the LAN the demo assumes, anyone on the same network can:
- open **Mailpit** (`:8025` web UI and API, `:1025` SMTP), read every verification and password-reset link, and take over any account through its reset link;
- reach **PostgreSQL** (`:5432`) with the dev credentials from `.env.example` (`musicroom`/`musicroom`) and read or change all data.

**Protections**
- **Network.** The API port has to be reachable by phones; Postgres and Mailpit don't. Only run the demo stack on a network you trust, such as your home Wi-Fi or a phone hotspot, never on shared, campus or café Wi-Fi.
- **Mitigation.** When phones aren't needed, or for Postgres and Mailpit in any case, bind the ports to the loopback interface with a local compose override, for example `"127.0.0.1:5432:5432"` and `"127.0.0.1:8025:8025"`. Mail links then open only from the host's Mailpit UI.
- **Credentials.** Change `POSTGRES_PASSWORD` in `.env` from the dev default.

**Residual risk.** With the default compose file on an untrusted network, account takeover through Mailpit and full database access are trivial. The compose file is a development setup, not a deployment. A real deployment uses a real SMTP service and keeps the database off the network (see [Out of scope](#out-of-scope)).

## Out of scope

- **TLS and production hosting.** The demo runs on local docker compose over plain HTTP on a trusted LAN. In production, the API would sit behind a reverse proxy that terminates TLS, and that proxy would be the right place for WAF and DDoS rules. No code would change.
- **Real email delivery.** Mailpit catches every mail locally. Switching to a real SMTP service only changes env vars.
- **Multi-instance deployments.** Presence and the search cache are in memory, and limits are per process.
