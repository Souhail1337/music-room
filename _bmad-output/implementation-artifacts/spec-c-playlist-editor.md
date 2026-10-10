---
title: 'C — Playlist Editor'
type: 'feature'
created: '2026-10-10'
status: 'done'
route: 'dispatch'
review_loop_iteration: 0
baseline_commit: '7f240f1f4c0a30e44549c2bd7f5d2e74eab06498'
context:
  - '{project-root}/_bmad-output/planning-artifacts/architecture/architecture-music-room-2026-10-10/ARCHITECTURE-SPINE.md'
  - '{project-root}/_bmad-output/planning-artifacts/ux-designs/ux-music-room-2026-10-10/EXPERIENCE.md'
  - '{project-root}/_bmad-output/planning-artifacts/ux-designs/ux-music-room-2026-10-10/DESIGN.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** The Playlists tab is a placeholder. The subject's second service — friends editing one playlist at the same time without silent overwrites — doesn't exist.

**Approach:** Deliver PRD FR-17–FR-21 end-to-end: a `playlists` API module (create/edit, visibility, `everyone|invited` edit license, invites, add/remove/move with `baseVersion`), live `playlist.updated` pushes with named presence, and the app's Playlists tab, Create/Edit playlist, Playlist editor screen, track-search and invite sheets.

## Boundaries & Constraints

**Always:** Follow spine AD-3 (every add/remove/move carries `baseVersion`; lock the playlist row `FOR UPDATE`; mismatch → 409 `{code:"VERSION_CONFLICT", details:{playlist, lastEditor}}`; positions rewritten `0..n-1`; `PlaylistTrack(playlistId, trackId)` unique; bump `version`; emit after commit with full ordered list), AD-1, AD-4 (private → 404 to non-viewers; non-editors get 403 `READ_ONLY` on a public `invited` playlist; owner always passes; socket join uses `canView`), AD-8 (tracks via `MusicService.ensureTrack`). Same error shape, Swagger, ActionLog and guards as specs A/B. Copy and states from EXPERIENCE.md.

**Decisions:** Edit license is `everyone | invited` only (no on-site). Presence for playlist rooms carries `{id, displayName}` of distinct viewers (header avatars). Reorder: drag handle (long-press) plus overflow "Move up / Move down"; remove by swipe or overflow with Undo snackbar. Discover also lists public playlists and its search covers them. No playlist deletion and no playlist playback (not in FR-17–21). Invites reuse `GET /users/search`.

**Never:** Friends/profile (spec D), load tests/docs/CI (spec E). Mutations over the socket. Last-write-wins on stale versions. Re-applying the user's move after a conflict. Changing spec B event behavior except shared plumbing (presence payload, socket room events, shared components).

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Add | editor, `baseVersion` current, new trackId | appended at end; version+1; push to room | duplicate track → 409 `TRACK_ALREADY_IN_PLAYLIST`; bad id → 404 `TRACK_NOT_FOUND` |
| Move | `{baseVersion, toIndex}` | track at `toIndex`, others shift; positions contiguous | `toIndex` out of range → 400 `VALIDATION_FAILED` |
| Remove | `{baseVersion}` | removed, positions compacted | unknown entry → 404 `NOT_FOUND` |
| Stale edit | `baseVersion` < current | nothing changes | 409 `VERSION_CONFLICT` + current playlist + `lastEditor`; app snaps, snackbar "Sam moved *Midnight City* — list updated." |
| Simultaneous moves | two users move same track, same `baseVersion`, in parallel | exactly one 200, the other 409; final order identical for all | — |
| Read-only | public `invited` playlist, non-invited user | can open; handles/Add hidden; chip "View only" | edit → 403 `READ_ONLY` |
| Private | non-invited user opens / joins socket room | 404; not listed in Discover or search | "This playlist is private." |
| Live | any change / viewer joins or leaves | every viewer gets `playlist.updated` (full state + version) within 1s; presence names update | stale version dropped; refetch on reconnect |

</frozen-after-approval>

## Code Map

- `apps/api/prisma/schema.prisma` -- `Track` (L98), enums `EventVisibility`/`EventLicense` (L113-118), `EventInvite` (L154) pattern; add `Playlist` (ownerId, name, description?, visibility, license `PlaylistLicense{EVERYONE,INVITED}`, version, lastEditorId?), `PlaylistInvite` (@@id), `PlaylistTrack` (id, playlistId, trackId, position, addedById; `@@unique([playlistId, trackId])`, Track `onDelete: Restrict`); User/Track back-relations; additive migration
- `apps/api/src/access/access.service.ts` -- generic `canView`/`canAct`/`assertCanAct` (L62-110); pass null geo fields for playlists; add `READ_ONLY` deny reason for playlists (keep event reasons unchanged)
- `apps/api/src/common/errors/app-error.ts` -- add `VERSION_CONFLICT` (409, details), `TRACK_ALREADY_IN_PLAYLIST` (409), `READ_ONLY` (403), `playlistNotFound`; `notInvited` copy is event-specific (L136) — don't reuse it for playlists
- `apps/api/src/events/events.service.ts` -- copy patterns, don't import: `mutate()` (L301-317), `broadcast()` (L320-329), `setInvite()` (L176-206, incl. `realtime.reauthorize`), `viewable()`/`hostOnly()`/`viewer()` (L332-350), authorizer registration (L75-85); `events.repository.ts` `lock()`/`bumpVersion()`/`transaction()` (L44, L122-136)
- `apps/api/src/events/event.view.ts` -- `UserRef`, `UserRefList` (L6-17) to reuse
- `apps/api/src/realtime/realtime.service.ts`, `realtime.gateway.ts` -- `emit` (L47), `registerRoomAuthorizer` (L28), `presence` (L56-61, counts only) — extend presence with `viewers: UserRef[]` (needs a display-name resolver registered by the domain module, like the authorizer; realtime must not import users)
- `apps/api/src/music/music.service.ts` -- `ensureTrack(id)` (L49), call before the transaction
- `apps/api/test/support/{app,users}.ts`, `test/events.e2e-spec.ts` helpers (L26-83), `test/concurrency/votes.e2e-spec.ts` -- reuse `createTestApp`, `FakeDeezer` ids 3135551–3135590, `verifiedUser`, `bearer`, socket helpers
- `apps/mobile/src/api/socket.ts` -- `ROOM_EVENTS` (L15) add `playlist.updated`; room fallback (L91) assumes events → pushes must carry `room`
- `apps/mobile/src/api/queries.ts` -- `queryKeys`, `applyPush`/`mergeDetail` version drop (L27-33), `useEventRoom` (L129-151) pattern
- `apps/mobile/app/(tabs)/playlists/{index,_layout}.tsx` -- replace placeholder; `app/_layout.tsx` L55-66 modal registration
- `apps/mobile/app/events/[id]/{suggest,invite}.tsx`, `src/events/components.tsx` (`TrackRow`, `Chip`, `Notice`, `ReconnectingBar`, `SkeletonRows`, `EmptyState`) -- extract shared track-search / invite pieces rather than duplicating
- `apps/mobile/app/(tabs)/discover/index.tsx` -- add public playlists section

## Tasks & Acceptance

**Execution:**
- [x] `apps/api/prisma/schema.prisma` + migration `playlists` -- models/constraints above -- AD-3
- [x] `apps/api/src/access/*`, `common/errors/app-error.ts` -- `READ_ONLY`, playlist error codes -- AD-4
- [x] `apps/api/src/playlists/*` -- `GET /playlists?scope=discover|mine|shared&q=`, `POST /playlists`, `GET|PATCH /playlists/:id`, `GET|PUT|DELETE /playlists/:id/invites[/:userId]`, `POST /playlists/:id/tracks {trackId, baseVersion}`, `PATCH /playlists/:id/tracks/:entryId {toIndex, baseVersion}`, `DELETE /playlists/:id/tracks/:entryId?baseVersion=`; detail returns `canEdit {allowed, reason}`, `isOwner`; register module in `app.module.ts` -- FR-17–20
- [x] `apps/api/src/realtime/*` -- named presence (`viewers`) via registered resolver; events keep working -- FR-21
- [x] `apps/api/test/playlists.e2e-spec.ts`, `test/concurrency/playlist-moves.e2e-spec.ts`, access unit spec additions -- every matrix row; N parallel moves on one `baseVersion` → exactly one 200, final positions contiguous and identical across GETs -- NFR-14, SM-2
- [x] `apps/mobile/src/api/{playlists,socket,queries}.ts` -- REST, `usePlaylistRoom`, conflict → write `details.playlist` to cache + snackbar -- AD-1
- [x] `apps/mobile/app/(tabs)/playlists/*`, `app/playlists/{new,[id]/index,[id]/edit,[id]/add,[id]/invite}.tsx`, discover section -- screens, states, copy; drag reorder (add `react-native-draggable-flatlist` via `npx expo install` only if compatible with Reanimated 4 / Expo Go; otherwise a gesture-handler + reanimated handle) plus Move up/down -- FR-17–21

**Acceptance Criteria:**
- Given two app sessions on the same playlist, when one adds or moves a track, then the other shows the new order within 1s and both header avatars show both users.
- Given both sessions move the same track at once, when the server answers, then both show the same order and the loser sees a snackbar naming the winner.
- Given a fresh `make up`, when `/docs` loads, then every playlist route is listed with inputs and outputs.
- Given the socket drops, when it reconnects, then the app shows "Reconnecting…" (edits disabled) and refetches.

## Implementation Notes

- Drag reorder uses the existing gesture-handler + Reanimated (no `react-native-draggable-flatlist`); Move up / Move down / Remove in the row overflow; swipe-to-remove with Undo (Undo = re-add then move back: two versioned edits, so a concurrent edit can leave it at the end with a conflict snackbar).
- Presence names come from a `registerPresenceResolver('playlist', …)` hook in `realtime`; `playlists` imports `UsersModule` (`UsersService.refs`) for it — a dependency the spine diagram doesn't draw (access → users already exists).
- Owner-only actions return 403 `NOT_OWNER`. Add returns 200 (the playlist). Every accepted edit bumps `version`, including settings/invites, so an in-flight track edit at that moment gets 409.
- Conflict snackbar wording ("moved / added / removed") is inferred by diffing the before/after lists; the 409 only names the last editor.
- Track/invite sheets extracted to `src/ui/{TrackSearchSheet,InviteSheet}.tsx` and reused by events.
- `npx expo lint` had never been set up: it created `apps/mobile/eslint.config.js` and added `eslint` + `eslint-config-expo`; two pre-existing spec A/B lint errors are silenced with explained disable comments.

## Spec Change Log

## Review Triage Log

| # | Finding (layer) | Verdict | Evidence | Route |
|---|---|---|---|---|
| 1 | PATCH name/description `null` → 500 (edge) | medium | `@IsOptional` lets null through; `update()` checks `!== undefined`, so null reaches a NOT NULL column | patch |
| 2 | Empty / identical PATCH bumps version → spurious 409s (edge, blind) | low | `update()` always `version: {increment: 1}` and broadcasts | patch |
| 3 | No-op move (`toIndex === from`) bumps version + broadcasts (edge, blind) | low | `edit()` always calls `bumpVersion` after `work` | patch |
| 4 | `becamePrivate` computed before the lock (edge) | low | read from `viewable()` outside the tx; direct fix is to compute it from the locked row | patch |
| 5 | Offset paging over moving `updatedAt` + app ignores `nextCursor` (edge, blind, vgap-other) | low | real, but needs >20 playlists in one scope; fix (keyset + infinite query) adds surface | reject |
| 6 | `baseVersion` 0 when cache empty (edge) | low | add sheet is only reached from the loaded detail screen | reject |
| 7 | Rapid successive edits send the same `baseVersion`; user's own second edit is lost (edge, blind) | medium | `usePlaylistEdits` reads `current().version` at fire time, nothing serializes | patch |
| 8 | Move sent with a newer cache version than the list the user saw; lands at wrong index without 409 (edge) | medium | `baseVersion()` reads the cache at mutation time, after a push may have replaced the list | patch |
| 9 | Conflict snackbar names last *track* editor after a settings/invite change (edge, blind, vgap-other) | medium | `update`/`setInvite` call `bumpVersion(tx, id)` without editor | patch |
| 10 | `conflictText` names the first shifted row, not the moved one (blind) | low | `after.find((e,i) => prev[i]?.id !== e.id)` → moving T1 to end names T2; visible in the demo flow | patch |
| 11 | User delete cascades `addedById` silently (blind) | false | no user-deletion path exists in the API | reject |
| 12 | `canAct` checked outside the row lock (blind) | low | ms window between uninvite and an in-flight edit; fix adds re-check logic | reject |
| 13 | Undo ignores `editsEnabled`, loses contributor, can end at the end on 409 (blind) | low | failure surfaces as a snackbar; end-position trade-off already accepted | reject |
| 14 | No delete / leave playlist (blind) | false | intent Decisions: "No playlist deletion" | reject |
| 15 | 404 screen always says "This playlist is private." (blind) | false | matrix row and EXPERIENCE.md prescribe that copy | reject |
| 16 | FK detection by message substring (blind) | low | copied from events; only the invitee FK can fail in that statement | reject |
| 17 | Pagination untested (vgap) | medium | no test sends `cursor`; filed pre-verified | patch |
| 18 | Invite version bump + `change:'invites'` push untested (vgap) | medium | filed pre-verified | patch |
| 19 | Mobile cache/conflict logic untested (vgap, blind) | medium | no mobile test runner; same gap as the spec-A deferred item | defer |
| 20 | `make lint` doesn't run the new mobile ESLint (vgap-other) | low | Makefile lint runs only `tsc` for mobile; one-line fix | patch |

## Design Notes

- **Conflict payload:** 409 body `{code:'VERSION_CONFLICT', message, details:{playlist: PlaylistState, lastEditor: UserRef|null}}`. `lastEditorId` is set on every successful track edit, so the snackbar can name the editor whose change won.
- **Move:** `toIndex` is the final 0-based index. In the transaction: remove the entry from the ordered list, insert at `toIndex`, rewrite all positions (`UPDATE … FROM (VALUES …)` or per-row updates inside the lock — n is small).
- **Push:** `playlist.updated {room, playlist, tracks, version, change: 'tracks'|'settings'|'invites', lastEditor}`; on `settings`/`invites` the app refetches REST for its own `canEdit`.

## Verification

**Commands:**
- `docker run --rm --network music-room_default -v "$PWD/apps/api":/app -v musicroom-api-nm:/app/node_modules -w /app -e TEST_DATABASE_URL=postgresql://musicroom:musicroom@postgres:5432/musicroom_test node:24 sh -c 'npm ci && npx prisma generate && npm run lint && npm run build && npm test && npm run test:e2e'` -- expected: all green incl. playlist concurrency spec (create migration in the same container with `DATABASE_URL=postgresql://musicroom:musicroom@postgres:5432/musicroom npx prisma migrate dev --name playlists`)
- `make up && curl -s localhost:3000/health` -- expected: `{"status":"ok"}`
- `cd apps/mobile && npx tsc --noEmit && npx expo lint` -- expected: clean

**Manual checks:**
- Emulator: create playlist → add 3 tracks → drag reorder; a second account via curl moves a track and the emulator updates live; a stale move shows the conflict snackbar.
