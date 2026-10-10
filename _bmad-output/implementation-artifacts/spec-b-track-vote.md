---
title: 'B — Track Vote'
type: 'feature'
created: '2026-10-10'
status: 'done'
route: 'dispatch'
review_loop_iteration: 0
baseline_commit: 'c756020f9fe591451307ef2c71cc8f25baa97e04'
context:
  - '{project-root}/_bmad-output/planning-artifacts/architecture/architecture-music-room-2026-10-10/ARCHITECTURE-SPINE.md'
  - '{project-root}/_bmad-output/planning-artifacts/ux-designs/ux-music-room-2026-10-10/EXPERIENCE.md'
  - '{project-root}/_bmad-output/planning-artifacts/ux-designs/ux-music-room-2026-10-10/DESIGN.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** After spec A, users can sign in but there is nothing to do: no music, no events. Track Vote is the core service — a room decides together what plays next.

**Approach:** Deliver PRD FR-9–FR-16 end-to-end: a backend `music` module that proxies Deezer search (AD-8), `events` (create/edit, visibility, license, invites, suggest, vote, advance), an `access` module shared by REST and sockets (AD-4), a Socket.IO `realtime` gateway that only broadcasts (AD-1), and the app screens: Discover with search, the Events tab, Create/Edit event, the Event screen (Now Playing, ranked queue, Suggest a track) and the Track search sheet, with host-only playback of 30-second previews.

## Boundaries & Constraints

**Always:** Follow spine AD-1 (REST is the only write path; emit after commit; pushes carry full state + `version`; clients drop stale versions and refetch on reconnect), AD-2 (unique `Vote(userId, suggestionId)` and `Suggestion(eventId, trackId)`; `INSERT … ON CONFLICT DO NOTHING`; atomic `voteCount ± 1` only when a row changed; order computed as `voteCount DESC, createdAt ASC`), AD-4 (private → 404 to non-viewers; refusals 403 with `NOT_INVITED | OUTSIDE_AREA | OUTSIDE_TIME_WINDOW`; host always passes; socket `join` calls `canView`), AD-5 (on-site checked on the server in UTC, haversine ≤ `radiusM`), AD-8 (Track keyed by Deezer ID; search cached 10 min; preview URL never stored, fetched fresh just before playing; the app never calls Deezer), AD-9 (only the host advances, with `expectedNowPlayingId`, in one transaction). Error shape, Swagger docs, ActionLog and auth guards from spec A apply to every new route. Copy from EXPERIENCE.md voice table and state patterns.

**Decisions:** Invites (FR-11) use a new `GET /users/search?q=` (display-name prefix or exact email, returns only id + display name, never other fields; excludes the caller) and an Invite sheet in the app; spec D reuses the search. The on-site venue is set with a "Use my current location" button plus radius chips (50 / 100 / 250 m) — no map. One spec covers FR-9–16 (user kept the ~2,700-token size).

**Never:** Playlists (spec C), Friends/profile (spec D), load tests/docs (spec E). Mutations over the socket. Storing preview URLs. Trusting client-sent track titles/artists (the server reads them from Deezer). Audio on non-host phones. Deleting events (not in FR-9).

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Search | `q="daft punk"` | ≤ 25 tracks (id, title, artist, artworkUrl, durationSec); same `q` within 10 min served from cache | Deezer down → 503 `MUSIC_UNAVAILABLE`, snackbar |
| Suggest new track | allowed user, trackId not queued | Suggestion with 1 vote (the suggester's); queue push to the room | Unknown Deezer id → 404 `TRACK_NOT_FOUND` |
| Suggest queued track | track already in queue | No duplicate; becomes the user's vote (idempotent) | — |
| Parallel votes | N users vote the same suggestion at once | `voteCount` rises by exactly N | — |
| Double vote | same user, duplicate requests | count changes by at most 1; unvote likewise | — |
| Invited-only | non-invited user votes/suggests | 403 `NOT_INVITED`; buttons disabled + banner | snackbar on revert |
| On-site | outside radius / outside window / no location | 403 `OUTSIDE_AREA` / `OUTSIDE_TIME_WINDOW` / 400 `LOCATION_REQUIRED` | banner text from EXPERIENCE.md |
| Private event | non-invited user opens it, or joins its socket room | 404 `NOT_FOUND`; not listed in Discover/search; join refused | "This event is private." |
| Advance | host, `expectedNowPlayingId` matches | top suggestion → Now Playing, removed from queue, push | mismatch → 200 with current state, nothing changes; non-host → 403 `NOT_HOST` |
| Live push | any change to queue / now playing | every viewer gets `queue.updated` with full state + `version` within 1s | stale version dropped; on reconnect refetch |

</frozen-after-approval>

## Code Map

- `apps/api/prisma/schema.prisma` -- add `Track`, `Event` (hostId, name, description, visibility, license, lat/lng/radiusM/startsAt/endsAt, nowPlayingTrackId, nowPlayingStartedAt, version), `EventInvite`, `Suggestion`, `Vote`; new migration (additive only)
- `apps/api/src/app.module.ts` -- register `MusicModule`, `AccessModule`, `EventsModule`; `RealtimeModule` stub already imported
- `apps/api/src/realtime/realtime.module.ts` -- empty stub to fill (gateway + `RealtimeService.emit`)
- `apps/api/src/auth/jwt-auth.guard.ts`, `sessions.service.ts` (`principal`) -- reuse to authenticate the socket handshake; `AuthModule` exports what the gateway needs
- `apps/api/src/users/users.service.ts`, `users.repository.ts`, `users.controller.ts` -- only exported users API (`findById`); add `search(q, excludeId)` and `GET /users/search` here
- `apps/api/src/common/errors/app-error.ts` -- add the new codes to `Errors`
- `apps/api/src/common/decorators/*`, `common/guards/throttler.config.ts` -- reuse `@CurrentUser`, global guards; no auth-throttle on event routes
- `apps/api/test/support/app.ts`, `test/auth.e2e-spec.ts` -- reuse `createTestApp`; add a fake `DeezerClient` override like `FakeGoogleVerifier`
- `apps/mobile/src/api/client.ts` -- the only HTTP client; add the socket client beside it, built from `api.serverUrl` with the access token
- `apps/mobile/app/(tabs)/discover/index.tsx`, `events/index.tsx`, `events/_layout.tsx` -- replace placeholders
- `apps/mobile/src/ui/components.tsx`, `Snackbar.tsx`, `theme.ts` -- reuse `Screen`, buttons, `Field`, `tokens`, `useSnackbar`
- `apps/mobile/app.config.ts` -- add `expo-location` (permission text) and `expo-audio` plugins; `socket.io-client` dep

## Tasks & Acceptance

**Execution:**
- [x] `apps/api/prisma/schema.prisma` + migration -- models and unique constraints above -- AD-2, AD-5, AD-8
- [x] `apps/api/src/music/*` -- `DeezerClient` (search, getTrack, preview; 5s timeout), `MusicService` (10-min search cache, `ensureTrack(id)` upsert), `GET /music/search`, `GET /music/tracks/:id/preview` -- AD-8
- [x] `apps/api/src/access/*` -- `canView`, `canAct(user, event, {lat,lng})` returning a reason code; haversine -- AD-4, AD-5
- [x] `apps/api/src/events/*` -- `POST/PATCH/GET /events`, `GET /events?scope=discover|hosting|invited|joined&q=`, invites, `POST /events/:id/suggestions`, `PUT|DELETE /events/:id/suggestions/:sid/vote`, `POST /events/:id/advance`; transactions + emit after commit -- FR-9–14, FR-16, AD-2, AD-9
- [x] `apps/api/src/users/*` -- `GET /users/search?q=` (min 2 chars, ≤ 20 results, `{id, displayName}` only) -- FR-11 invites
- [x] `apps/api/src/realtime/*` -- Socket.IO gateway (JWT handshake, `join`/`leave` with `canView`, listener count), `RealtimeService.emit` -- FR-15, AD-1
- [x] `apps/api/test/events.e2e-spec.ts`, `test/concurrency/votes.e2e-spec.ts`, unit specs for access + music cache -- every matrix row, N parallel votes → +N -- NFR-14
- [x] `apps/mobile/src/api/{events,music,socket}.ts` + query hooks -- REST calls, socket that joins rooms and writes pushes into the React Query cache, refetch on reconnect -- AD-1
- [x] `apps/mobile/app/(tabs)/discover`, `(tabs)/events`, `events/new`, `events/[id]`, `events/[id]/edit`, track-search and invite sheets -- screens, states and copy per EXPERIENCE.md; host playback with `expo-audio` (Play/Pause, Skip, auto-advance at the end) -- FR-9–16
- [x] `apps/mobile/app.config.ts`, `package.json` -- `expo-location`, `expo-audio`, `socket.io-client`; rebuild the APK -- native modules

**Acceptance Criteria:**
- Given two emulator/app sessions viewing the same event, when one votes, then the other shows the new count and order within 1s without refreshing.
- Given the host's phone on an event with a queue, when the preview ends or the host taps Skip, then the top suggestion becomes Now Playing on every phone and only the host's phone plays audio.
- Given a fresh `make up`, when `/docs` loads, then every music and event route is listed with inputs and outputs.
- Given the socket drops and reconnects, when it is back, then the app refetches the event and shows "Reconnecting…" while disconnected (actions disabled).

## Implementation Notes

- Socket `join` authorization: `realtime` exposes `registerRoomAuthorizer(prefix, fn)`; `events` registers `event` using `AccessService.canView`, so `realtime` never imports a domain module.
- Pushes: one socket event `queue.updated` carrying the full shared state + `version` + `change` (`queue|nowPlaying|settings|invites`); on `settings`/`invites` the app refetches REST for its own `canAct`. `presence.updated {room, listeners}` on join/leave.
- Every queue change locks the event row first (`SELECT … FOR UPDATE`), then inserts with `ON CONFLICT DO NOTHING` and moves `voteCount` only if a row changed; this ordering avoids vote/advance deadlocks.
- Unvote only needs view access (removing your own vote isn't gated by the license).
- On-site window in the form: Today/Tomorrow (or the stored day) + HH:MM fields; an end at/before the start rolls to the next day.

## Spec Change Log

## Review Triage Log

## Design Notes

- **Per-user fields stay out of pushes.** Broadcasts carry the shared state (event, nowPlaying, queue with counts, version, listeners). `myVotes` and `canAct {allowed, reason}` come only from REST (`GET /events/:id?lat&lng` and every mutation response); the app merges them with pushes.
- **"Joined" events** = events where the user has a suggestion or a vote. **LIVE** = the event has a Now Playing track.
- **Advance flow (host):** play preview → on end call `advance(expectedNowPlayingId)` → fetch fresh preview of the new track → play. Two host devices racing are safe by AD-9.

## Verification

**Commands:**
- API (host has Node 23; Prisma 7 needs Node 24 — always run npm in this container, from the repo root, with the compose stack up): `docker run --rm --network music-room_default -v "$PWD/apps/api":/app -v musicroom-api-nm:/app/node_modules -w /app -e TEST_DATABASE_URL=postgresql://musicroom:musicroom@postgres:5432/musicroom_test node:24 sh -c 'npm ci && npx prisma generate && npm run lint && npm run build && npm test && npm run test:e2e'` -- expected: all green, including the concurrency spec. Add deps with `npm install <pkg>` in the same container; create the migration with `npx prisma migrate dev --name track_vote` there (`DATABASE_URL=postgresql://musicroom:musicroom@postgres:5432/musicroom`).
- `make up && curl -s localhost:3000/health` -- expected: `{"status":"ok"}` from the rebuilt API image
- `cd apps/mobile && npx tsc --noEmit` -- expected: clean (host Node is fine here; add mobile deps with `npx expo install <pkg>`)
- `cd apps/mobile/android && JAVA_HOME="/Applications/Android Studio.app/Contents/jbr/Contents/Home" ANDROID_HOME=~/Library/Android/sdk ./gradlew assembleDebug -PreactNativeArchitectures=arm64-v8a --max-workers=3` -- expected: APK builds (8 GB RAM: never build all 4 ABIs; run `npx expo prebuild --platform android --no-install` first if native plugins changed)

**Manual checks:**
- Emulator: create an event → Suggest a track (search "daft punk") → vote → Play; a second session (curl or second account) votes and the emulator updates live.
