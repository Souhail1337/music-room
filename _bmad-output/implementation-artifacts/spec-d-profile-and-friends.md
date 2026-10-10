---
title: 'D — Profile & Friends'
type: 'feature'
created: '2026-10-10'
status: 'done'
route: 'dispatch'
review_loop_iteration: 0
baseline_commit: '7edac3895b54abc5eb2d1cd90010400e792a42d5'
context:
  - '{project-root}/_bmad-output/planning-artifacts/architecture/architecture-music-room-2026-10-10/ARCHITECTURE-SPINE.md'
  - '{project-root}/_bmad-output/planning-artifacts/ux-designs/ux-music-room-2026-10-10/EXPERIENCE.md'
  - '{project-root}/_bmad-output/planning-artifacts/ux-designs/ux-music-room-2026-10-10/DESIGN.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** The Profile tab is a placeholder. The subject's three privacy levels, friends, and linking a Google account to an email account (FR-3, FR-6–8) don't exist, and invite sheets can't offer friends.

**Approach:** Add profile sections stored as JSON columns and returned only through `ProfileView.for(viewer, target)` (AD-7), a mutual friendship model with requests, and `POST /me/google` to link Google. In the app: the Profile tab with four privacy-labelled section cards and an editor per section, Friends (list, requests, add), another user's profile, Settings → Linked accounts, and Friends offered first in the invite sheets.

## Boundaries & Constraints

**Always:** AD-7 — no controller returns a Prisma `User`; every other-user payload goes through `ProfileView`; private fields never leave the API for anyone but the owner (enforced server-side and tested). AD-6 — Google ID tokens verified on the server with the existing `GoogleVerifierService`. Same error shape, Swagger, ActionLog, guards as specs A–C. Copy and states from EXPERIENCE.md (privacy cards labelled "Everyone / Friends / Only me", skeleton rows, pull-to-refresh on Friends, snackbars).

**Decisions:** Section fields (all optional strings, trimmed, length-capped): Public `{bio ≤ 280, city ≤ 60}`; Friends `{phone ≤ 30, birthday YYYY-MM-DD}`; Private `{fullName ≤ 80, address ≤ 200}`; Music preferences `{genres: string[] ≤ 10, artists: string[] ≤ 10}`, visible to everyone. `displayName` stays public and editable from the Public card. Friendship is mutual: a request A→B while B→A is pending accepts both. Decline and cancel delete the request; remove deletes the friendship. FR-3 is link-only (no unlink); a Google account already linked to another user → 409 `GOOGLE_ALREADY_LINKED`. User search results and the invite sheets show friends first. No realtime for friend requests (pull-to-refresh). Facebook stays out.

**Never:** Load tests/docs/CI (spec E). Returning email to other users. Exposing friends-only fields to non-friends or private fields to anyone else. Linking Google as a side effect of login (keep `ACCOUNT_EXISTS`). Changing event/playlist behavior beyond the invite sheet's friend list.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Edit section | `PATCH /me/profile {public:{bio}}` | only that section changes; `GET /me/profile` returns all four | too long / bad date → 400 `VALIDATION_FAILED` |
| Stranger views | A not friends with B | `public` + `musicPrefs` only; no `friends`, no `private`, no email | unknown id → 404 `USER_NOT_FOUND` |
| Friend views | A and B friends | adds `friends`; never `private` | — |
| Self views | A views A via `/users/:id/profile` | all sections | — |
| Request | A→B, none pending | B sees it under incoming, A under outgoing | to self → 400; already friends → 409 `ALREADY_FRIENDS`; duplicate → idempotent |
| Crossed requests | A→B pending, B→A sent | friendship created, both requests gone | — |
| Accept / decline / cancel / remove | addressee accepts or declines; requester cancels; either removes | friendship created / request deleted / friendship deleted | not the right party or nothing pending → 404 `NOT_FOUND` |
| Link Google | logged-in email user, valid token, unused sub | `MeView.hasGoogle = true`; Google login now works for this account | sub on another user → 409 `GOOGLE_ALREADY_LINKED`; invalid → 401 `GOOGLE_TOKEN_INVALID`; not configured → 503 `GOOGLE_NOT_CONFIGURED` |

</frozen-after-approval>

## Code Map

- `apps/api/prisma/schema.prisma` -- `User` (L15-39: `passwordHash?`, `displayName`, `googleSub? @unique`); add `publicInfo`, `friendsInfo`, `privateInfo`, `musicPrefs` (`Json @default("{}")`) and `Friendship` / `FriendRequest` (or one model with `status`) with a unique pair; additive migration
- `apps/api/src/users/user.view.ts` -- `MeView.of` (L5-38, comment anticipates ProfileView), `UserSummary` (L41-52); add `ProfileView.for(viewer, target, areFriends)`
- `apps/api/src/users/users.{controller,service,repository}.ts`, `users.dto.ts` -- `GET /me` (L24), `GET /users/search` (L40, `search(q, excludeId)` ≤ 20, prefix name or exact email), `repo.update(id, data)`; add `GET|PATCH /me/profile`, `GET /users/:id/profile`, friends routes, `POST /me/google`; search result gains `isFriend` and sorts friends first
- `apps/api/src/auth/google-verifier.service.ts` -- `isConfigured()`, `verify(idToken)` → `{sub,email,name}|null` (L29); `auth.service.ts:81-98` `loginWithGoogle` (keeps `ACCOUNT_EXISTS`, comment at :88 defers linking to FR-3); `dto/auth.dto.ts:54` `GoogleLoginDto {idToken}` to reuse
- `apps/api/src/common/errors/app-error.ts` -- add `ALREADY_FRIENDS`, `GOOGLE_ALREADY_LINKED`
- `apps/api/test/support/app.ts:35-46` -- `FakeGoogleVerifier` tokens `valid|<sub>|<email>|<name>`; `test/auth.e2e-spec.ts:613-664` usage; `test/support/users.ts` `verifiedUser`, `bearer`
- `apps/mobile/app/(tabs)/profile/{index,_layout}.tsx` -- placeholder (avatar, name, email, cog → /settings); `app/settings.tsx` (Server URL, Log out; "Linked accounts arrive with spec D")
- `apps/mobile/src/auth/google.ts` -- `getGoogleIdToken()` (null on cancel, throws `GoogleNotConfiguredError`)
- `apps/mobile/src/api/{auth,users,queries}.ts` -- `authApi.me`, `ME_QUERY_KEY`, `usersApi.search`, `useUserSearch`
- `apps/mobile/src/ui/InviteSheet.tsx` -- `InviteSheet({invites, loading, pendingUserId, onToggle})`, `initial(name)`; show a Friends section when the query is empty
- `apps/mobile/src/playlists/components.tsx` -- `AvatarStack` (L19) for avatars; `src/events/components` `EmptyState`, `SkeletonRows`; `src/ui` `Screen`, buttons, `Field`, `useSnackbar`, `useDebounced`

## Tasks & Acceptance

**Execution:**
- [x] `apps/api/prisma/schema.prisma` + migration `profile_friends` -- profile JSON columns, friendship + request models with unique pairs -- AD-7, FR-6, FR-8
- [x] `apps/api/src/users/*` -- `ProfileView`, profile routes, friends routes (`GET /friends`, `GET /friends/requests` incoming+outgoing, `POST /friends/requests {userId}`, `POST /friends/requests/:id/accept|decline`, `DELETE /friends/requests/:id`, `DELETE /friends/:userId`), search `isFriend` + friends first -- FR-6–8
- [x] `apps/api/src/users/*` or `auth/*` -- `POST /me/google {idToken}`; error codes -- FR-3
- [x] `apps/api/test/profile-friends.e2e-spec.ts` + `ProfileView` unit spec -- every matrix row; leak test asserting `private`/`friends`/`email` keys are absent from stranger responses (including search) -- NFR-14
- [x] `apps/mobile/src/api/{users,queries}.ts` -- profile, friends, link-Google calls and hooks
- [x] `apps/mobile/app/(tabs)/profile/*`, `app/profile/edit/[section].tsx`, `app/friends/index.tsx`, `app/users/[id].tsx`, `app/settings.tsx`, `src/ui/InviteSheet.tsx` -- screens, states, copy; user names in Friends/search/playlist owner open `users/[id]` -- FR-3, FR-6–8

**Acceptance Criteria:**
- Given two accounts that become friends in the app, when one opens the other's profile, then Friends info appears; after removing the friend it disappears on refresh.
- Given an email account in Settings → Linked accounts, when Google is configured and the user links it, then logging out and "Continue with Google" opens the same account.
- Given the invite sheet on an event or playlist with an empty query, when it opens, then the user's friends are listed first.
- Given a fresh `make up`, when `/docs` loads, then every profile, friends and link route is listed with inputs and outputs.

## Implementation Notes

- `ProfileView.for(viewerId, target, relation)` takes a `Relation {friendship, requestId?}` instead of a bare `areFriends` boolean, so the same view also carries `incoming`/`outgoing` and the pending `requestId` the app needs to accept/cancel from a profile. `friends` is still added only for `friendship === 'friends'` or self.
- Friendship rows are canonical (`userAId < userBId`, composite PK); crossed requests are serialized with a transaction-scoped advisory lock on the pair (`pg_advisory_xact_lock`), covered by a parallel e2e test.
- `PATCH /me/profile` merges per field inside a section; `''` / `[]` clears a field. Lists are trimmed, de-duplicated (case-insensitive), ≤ 10 items of ≤ 40 chars.
- `POST /friends/requests` and `.../accept` answer 200 with the other user's `ProfileView`; decline / cancel / remove answer 204. Malformed ids are treated as unknown (404).
- `POST /me/google` lives in the auth module (`LinkGoogleController`) because users must not import auth; it uses `@AuthThrottle()` (5/min per IP+bearer). An account already linked to a *different* Google account also gets 409 `GOOGLE_ALREADY_LINKED` (link-only, no re-link).
- `UserSummary` gained `isFriend`; the spec-B events e2e assertion on search keys was updated accordingly.

## Spec Change Log

## Review Triage Log

| # | Finding (layer) | Verdict | Evidence | Route |
|---|---|---|---|---|
| 1 | Accept vs cancel/decline race: 204 cancelled yet friendship created (blind, edge) | medium | cancel/decline delete outside `withPairLock`; accept re-checks then befriends | patch |
| 2 | `PATCH /me/profile` `displayName: null` → 500 (edge) | medium | `@IsOptional` passes null to a NOT NULL column | patch |
| 3 | Concurrent PATCH of one section loses a field (blind, edge) | low | same user, two devices, same section at once; fix adds locking | reject |
| 4 | InviteSheet "Nobody found" never shows (edge) | low | empty `People` section counts as content; one-line filter | patch |
| 5 | InviteSheet / Friends screen swallow query errors (blind, edge) | low | needs error UI branches; rare on LAN | reject |
| 6 | `['me']` key duplicated in queries.ts; dead `if (profile.displayName)` (blind, vgap) | low | direct correction: import `ME_QUERY_KEY`, drop the guard | patch |
| 7 | Remove friend has no confirmation (blind) | low | destructive for both users; a confirm dialog is a direct addition | patch |
| 8 | Misleading "keyed so the form re-reads" comment (blind) | low | key is `section`; comment wrong | patch |
| 9 | No realtime for incoming requests (blind) | false | intent Decisions: "No realtime for friend requests (pull-to-refresh)" | reject |
| 10 | Generic `NOT_FOUND` for request/friend (blind) | false | matrix prescribes 404 `NOT_FOUND` | reject |
| 11 | Malformed ids → 404 not 400; UUID regex duplicated (blind) | low | consistent with specs B/C (404 for malformed) | reject |
| 12 | No DB CHECK constraints on pair ordering / self-request (blind, edge) | low | all writes go through `pair()` + lock; migration already applied on dev | reject |
| 13 | Friend-request spam, future birthdays, unbounded lists, large IN lists, P2028 (blind, edge) | low | global throttle exists; scale far beyond demo | reject |
| 14 | Target deleted mid-request → FK 500 (edge) | false | no user-deletion path | reject |
| 15 | `useProfile('me')` key collision; Retry on permanent 404 (edge) | low | deep link `/users/me` not produced by the app; cosmetic | reject |
| 16 | Link Google accepts any Google email / no email shown (blind) | low | link-any-Google is FR-3 as written | reject |
| 17 | Clearing birthday with `''` untested though the form sends it (vgap) | medium | pre-verified | patch |
| 18 | Search 20-cap after friends-first split untested (vgap) | medium | pre-verified; cap untested before this change too | defer |
| 19 | `@AuthThrottle` on `POST /me/google` untested (vgap) | medium | pre-verified | patch |
| 20 | Malformed-id guards on request/accept/cancel untested (vgap) | medium | pre-verified | patch |
| 21 | Friends / requests ordering untested (vgap) | medium | pre-verified | patch |
| 22 | No mobile automated verification (vgap) | medium | no mobile test runner | defer |
| 23 | linkGoogle concurrent branches untested (vgap-other) | low | handled race paths; hard to trigger in e2e | reject |

## Design Notes

- Build every other-user response from `ProfileView.for(viewer, target, areFriends)` → `{id, displayName, public, musicPrefs, friends?, private?, friendship: 'none'|'friends'|'incoming'|'outgoing'|'self'}`. Keep the key absent (not `null`) when hidden, so the leak test can assert `not.toHaveProperty`.
- Store the friendship pair canonically (`userAId < userBId`) so the unique constraint covers both directions.

## Verification

**Commands:**
- `docker run --rm --network music-room_default -v "$PWD/apps/api":/app -v musicroom-api-nm:/app/node_modules -w /app -e TEST_DATABASE_URL=postgresql://musicroom:musicroom@postgres:5432/musicroom_test node:24 sh -c 'npm ci && npx prisma generate && npm run lint && npm run build && npx tsc --noEmit -p tsconfig.json && npm test && npm run test:e2e'` -- expected: all green (create the migration in the same container with `DATABASE_URL=postgresql://musicroom:musicroom@postgres:5432/musicroom npx prisma migrate dev --name profile_friends`)
- `make up && curl -s localhost:3000/health` -- expected: `{"status":"ok"}`
- `cd apps/mobile && npx tsc --noEmit && npx expo lint` -- expected: clean

**Manual checks:**
- Emulator: edit each profile card; send a friend request to a second account (curl), accept it, open their profile and see Friends info; invite sheet lists the friend first.
