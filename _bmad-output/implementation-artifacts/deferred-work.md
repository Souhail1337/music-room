# Deferred Work

- source_spec: none
  summary: Track Vote — events, visibility/license, suggest & vote, live queue, host playback (FR-9–16)
  evidence: Split from "build the whole app" intent; depends on Foundation + Accounts
- source_spec: none
  summary: Playlist Editor — playlists, visibility/license, versioned realtime editing (FR-17–21)
  evidence: Split from "build the whole app" intent; depends on Foundation + Accounts
- source_spec: none
  summary: Profile & Friends — 3-tier privacy profile, friends, Google account linking (FR-3, FR-6–8)
  evidence: Split from "build the whole app" intent; depends on Foundation + Accounts
- source_spec: none
  summary: Delivery docs — k6 load tests, SECURITY.md, LOADTEST.md, AI_USAGE.md, CI workflow (NFR-9, 11, 12, 15)
  evidence: Split from "build the whole app" intent; best done once features exist
- source_spec: `_bmad-output/implementation-artifacts/spec-a-foundation-and-accounts.md`
  summary: Add a mobile test runner and unit tests for ApiClient refresh (single-flight, session-ended, normalizeServerUrl) and the AuthProvider state machine.
  evidence: apps/mobile has no *.spec/*.test files or test script; removing the `??=` single-flight would make parallel 401s reuse a refresh token (server revokes the family) with nothing failing.
- source_spec: `_bmad-output/implementation-artifacts/spec-a-foundation-and-accounts.md`
  summary: Check whether the API sees one client IP for every device behind Docker Desktop port forwarding, which would make the per-IP throttles shared.
  evidence: Unverified (would be medium). Settle it by logging `req.ip` (action_logs.ip) for requests from two different LAN devices against `make up`.
- source_spec: `_bmad-output/implementation-artifacts/spec-c-playlist-editor.md`
  summary: Unit-test the mobile playlist cache rules (applyPlaylistState force/stale drop, mergePlaylist) and conflictText once a mobile test runner exists.
  evidence: apps/mobile has no test runner; breaking the equal-version `force` rule would leave an optimistic reorder on screen after a 409 with nothing failing.
