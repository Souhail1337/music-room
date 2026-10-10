---
title: Music Room — Product Requirements Document
status: final
created: 2026-10-10
updated: 2026-10-10
---

# PRD: Music Room

## 0. Document Purpose

This PRD turns the 42 subject *Music Room v6* (`musicc.pdf`) into testable requirements for a solo build with a same-day deadline. It feeds `bmad-architecture` and `bmad-build`. The screens, states and flows are already decided in the UX spec at `_bmad-output/planning-artifacts/ux-designs/ux-music-room-2026-10-10/` (`DESIGN.md`, `EXPERIENCE.md`). This PRD references them instead of repeating them. Technology choices live in `addendum.md`. Inferred items are tagged and listed in §10.

## 1. Vision

Music Room lets the people in a room decide together what plays next, and lets friends build playlists together in real time. The Android app is only a remote control: the backend holds the truth, and every phone sees the same queue, the same votes and the same playlist order within about a second.

The product exists to meet the mandatory part of the subject perfectly: accounts with three privacy levels, two collaborative services with visibility and license rules, a documented REST API, security, action logging, measured load capacity, and CI. Everything else is cut.

## 2. Target User

### 2.1 Jobs To Be Done
- At a party, I want to push the track I love up the queue without having to grab the host's phone.
- As a host, I want to control who can vote: everyone, only my guests, or only people physically in the room during the party.
- With friends, I want to build a playlist together at the same time, without our edits overwriting each other silently.
- As a user, I want to choose what strangers, friends, and only I can see about me.
- As the student builder, I want every requirement in the subject to be demonstrable and defensible at evaluation.

### 2.2 Key User Journeys
These mirror `EXPERIENCE.md` → Key Flows.

- **UJ-1. Yasmine signs up and verifies her email on the train home.** Sign up → "Check your email" → link → "I've verified" → Discover. Alternative: Continue with Google. Edge case: forgotten password → reset email → new password.
- **UJ-2. Yasmine votes her track to the top at Karim's party.** Discover → LIVE event (On-site, 20:00–02:00) → allows location → suggests *One More Time* → friends vote → it climbs → **it becomes Now Playing**. Edge case: her cousin at home sees disabled voting with the reason.
- **UJ-3. Yasmine and Sam build a road-trip playlist on two phones.** A private playlist with invited-only editing → invites Sam → both add tracks live → both move the same track at the same moment → the server keeps one move, the other phone snaps to it and gets a notice → **both phones show the same order**.

## 3. Glossary

- **User**: a person with a Music Room account.
- **Friend**: a User linked to another User by an accepted friend request (mutual).
- **Profile**: a User's information in four sections: **Public info** (visible to every User), **Friends info** (visible to Friends), **Private info** (visible only to its owner) and **Music preferences**.
- **Track**: a song from the Deezer catalog, referenced by its Deezer ID, with title, artist, artwork and a 30-second preview URL.
- **Event**: a Track Vote session created by a **Host**. It has a **Queue** and a **Now Playing** Track.
- **Queue**: the ordered list of **Suggestions** in an Event, sorted by vote count (descending), then by suggestion time (earliest first).
- **Suggestion**: a Track added to an Event's Queue by a User.
- **Vote**: one User's support for one Suggestion. A User has at most one Vote per Suggestion.
- **Playlist**: a collaboratively edited, ordered list of Tracks with an **Owner**.
- **Visibility**: `public` (any User can find and open it) or `private` (only the Owner/Host and **Invited users** can find and open it). Default: `public`.
- **License**: who may act. For an Event: `everyone` (default), `invited`, or `on_site` (inside a geofence and a time window). For a Playlist: `everyone` (default) or `invited`.
- **Invited user**: a User explicitly invited to an Event or Playlist by its Host/Owner.
- **Action log**: a backend record of an app action, including platform, device model and app version.

## 4. Features

### 4.1 Accounts & Authentication (subject V.1, V.5)

**Description:** First launch requires an account. Users sign up with email/password (the email must be verified) or with Google. An email account can later link a Google account. Users can reset a forgotten password. Realizes UJ-1.

#### FR-1: Email sign-up with verification
A visitor can create an account with email, password and display name.
- The system sends a verification email containing a single-use link that expires after 24h.
- Until verified, the account cannot use any service endpoint (HTTP 403 with code `EMAIL_NOT_VERIFIED`).
- The password has at least 8 characters and is stored hashed (never in plain text).
- A duplicate email returns a clear error.

#### FR-2: Google sign-in
A visitor can sign up or log in with Google. A Google account is treated as verified.

#### FR-3: Link a Google account
A logged-in email User can link a Google account in Settings. Afterwards they can log in either way.
- Linking a Google account that already belongs to another User is refused.

#### FR-4: Password reset
A User can request a reset email and set a new password from the link.
- The link is single-use and expires after 1h.
- Using it invalidates all of that User's existing sessions.
- Requesting a reset for an unknown email returns the same response as for a known one, so the endpoint can't be used to discover accounts.

#### FR-5: Sessions
A logged-in User stays logged in across app restarts. Logging out ends the session on the server.

### 4.2 Profile & Friends (subject V.1, V.6)

#### FR-6: Edit profile sections
A User can view and update their Public info, Friends info, Private info and Music preferences (favorite genres/artists).

#### FR-7: Privacy-filtered profile view
When User A opens User B's profile, A receives only Public info, plus Friends info if A and B are Friends. Private info is never returned to anyone except B.
- This filtering is enforced by the API, not just hidden in the app.

#### FR-8: Friends
A User can search Users by name, send a friend request, accept or decline one, and remove a Friend.

### 4.3 Music Track Vote (subject V.2.1)

**Description:** A Host creates an Event. Users suggest Tracks and vote. The Queue re-orders live, and when the Now Playing Track ends, the top Suggestion becomes Now Playing. Realizes UJ-2.

#### FR-9: Create / edit an Event
A User can create an Event with name, description, Visibility (default `public`) and License (default `everyone`). The `on_site` License also needs a location, a radius and a start/end time. The Host can edit these settings later.

#### FR-10: Find and open Events
- Public Events are listed in Discover and searchable by every User.
- A private Event is visible and openable only by its Host and Invited users. Anyone else gets "not found / private".

#### FR-11: Invite to an Event
The Host can invite and un-invite Users (typically Friends).

#### FR-12: Suggest a Track
A User allowed to vote can search the Deezer catalog and add a Track as a Suggestion. Adding it counts as the suggester's first Vote.
- If the Track is already in the Queue, nothing is duplicated; the action becomes a Vote for the existing Suggestion.

#### FR-13: Vote / remove Vote
A User allowed to vote can Vote for a Suggestion, and remove their Vote.
- Each User has at most one Vote per Suggestion, guaranteed by the database (a unique constraint), not only by app logic.
- When N different Users vote at the same moment, the count rises by exactly N, with no lost updates.
- When the same User double-taps or sends duplicate requests, the count changes by at most 1.

#### FR-14: License enforcement
Every Vote and Suggestion is checked by the server against the License:
- `everyone`: any User who can see the Event may act.
- `invited`: only the Host and Invited users.
- `on_site`: only Users whose submitted location is within the radius, during the time window.
- A refused action returns 403 with a reason code (`NOT_INVITED`, `OUTSIDE_AREA`, `OUTSIDE_TIME_WINDOW`), which the app shows as the messages in `EXPERIENCE.md`.

#### FR-15: Live Queue
Every User viewing an Event receives Queue changes (new Suggestion, vote count, order, Now Playing) within 1s, without refreshing.

#### FR-16: Playback (Host)
The Host's phone plays the Now Playing Track's 30-second Deezer preview. When it ends, or when the Host taps Skip, the top Suggestion becomes Now Playing and leaves the Queue. Other Users see the Now Playing state; their phones don't play audio.

### 4.4 Music Playlist Editor (subject V.2.3)

**Description:** Owners and allowed Users add, remove and reorder Tracks together. Changes appear live, and concurrent moves are resolved by the server with no silent overwrites. Realizes UJ-3.

#### FR-17: Create / edit a Playlist
A User can create a Playlist with name, Visibility (default `public`) and License (default `everyone`) and edit these later. The Owner can invite and un-invite Users.

#### FR-18: Access by Visibility
Public Playlists can be opened by every User. Private Playlists can be opened only by the Owner and Invited users.

#### FR-19: Edit by License
- With `everyone`, any User who can open the Playlist can add, remove and move Tracks.
- With `invited`, only the Owner and Invited users can; everyone else gets a read-only view.
- This is enforced by the server.

#### FR-20: Concurrent-safe edits
Every edit carries the Playlist version the client last saw. The server applies edits one at a time per Playlist.
- An edit based on an outdated version is rejected with 409 and the current state. The client snaps to that state and tells the user who made the winning change.
- Two Users moving the same Track at the same time end with every client showing an identical order.
- Adding a Track that is already in the Playlist is refused.

#### FR-21: Live Playlist
Every User viewing a Playlist receives changes within 1s, and sees who else is currently viewing it.

### 4.5 Settings & Platform (subject V.5)

#### FR-22: Configurable server URL
A User can set the backend URL in Settings, and also before logging in, then test the connection. The URL persists on the device.

#### FR-23: Remote-control client
The app stores no authoritative data. All state comes from the API or the real-time channel. The Android app covers every user action in this PRD.

## 5. Cross-Cutting NFRs

### 5.1 API (subject V.4)
- **NFR-1:** REST over HTTPS-capable HTTP with JSON bodies. Errors use one shape: `{ code, message }`.
- **NFR-2:** An OpenAPI (Swagger) reference documents every endpoint's method, inputs and outputs. It is generated from the code and served by the backend.
- **NFR-3:** Real-time updates use a socket channel. Every change also lands through REST, so the system still works if the socket drops.

### 5.2 Security (subject V.6, V.8)
- **NFR-4:** Every endpoint except auth and health requires a valid access token. Users can read and modify only their own data, plus what Visibility and License grant them.
- **NFR-5:** Login, sign-up and password reset are rate-limited per IP and per account, to slow down brute force.
- **NFR-6:** Access tokens are short-lived (15 min) and refresh tokens are rotated. A reused refresh token revokes the whole session family, which limits damage from stolen sessions.
- **NFR-7:** Inputs are validated server-side. Database access uses parameterized queries only.
- **NFR-8:** Secrets live only in `.env`, which is git-ignored. A `.env.example` is committed. A pre-commit or CI check scans for secrets.
- **NFR-9:** A `SECURITY.md` lists other threats and the practical protections against them (for example: token storage on the device, Deezer API abuse, location spoofing for `on_site`, websocket flooding).

### 5.3 Logging (subject V.6)
- **NFR-10:** Every API call from the app is recorded in the Action log with user ID, action, timestamp, platform, device model and app version. The app sends these in headers on every request.

### 5.4 Ramp-up (subject V.7)
- **NFR-11:** A repeatable load test (k6) exercises auth, voting and playlist editing on all services at once.
- **NFR-12:** `LOADTEST.md` records the server specs (CPU, RAM, where it runs), the results, and the maximum number of simultaneous users justified by those results.

### 5.5 Quality & Delivery (subject IV.1, V.8)
- **NFR-13:** `make` (or `docker compose up`) builds and runs everything from a fresh clone. No third-party libraries are committed to the repo.
- **NFR-14:** Each layer has focused tests: API unit/integration tests, including the concurrency tests for FR-13 and FR-20, plus a smoke test for the app.
- **NFR-15:** CI runs lint and tests on every push.

## 6. Non-Goals

- Music Control Delegation (V.2.2): the subject requires only 2 of the 3 services.
- Facebook login. Google satisfies "Facebook or Google".
- iOS, the web client, IoT/iBeacon, subscriptions and offline mode. These are bonuses, graded only if the mandatory part is perfect.
- Full-length streaming or music licensing. Only Deezer 30-second previews are used.
- A light theme.

## 7. MVP Scope

**In:** FR-1 to FR-23 and NFR-1 to NFR-15.

**Build order if time runs short:** Accounts (FR-1, 2, 4, 5) → Track Vote (FR-9 to 16) → Playlist Editor (FR-17 to 21) → Profile/Friends (FR-6 to 8) → FR-3 → Ramp-up docs. Everything in the mandatory part is graded, so cutting anything risks failing.

## 8. Success Metrics

- **SM-1:** Every mandatory item from subject V.1 to V.8 can be demonstrated live at evaluation. Validates all FRs.
- **SM-2:** The concurrency tests for FR-13 (N simultaneous votes → +N) and FR-20 (simultaneous moves → identical final order) pass in CI.
- **SM-3:** Souhail can explain every tech choice and every concurrency mechanism without notes (subject §II).
- **SM-C1 (counter-metric):** Number of features beyond the mandatory part. Don't optimize it, because bonuses are worthless until the mandatory part is perfect.

## 9. Open Questions

1. Is the deadline the submission time or the defense time? This affects whether the load-test docs can be done afterwards.
2. Has the Google OAuth client (an Android SHA-1 is needed) been created yet? It takes setup time.
3. Which email provider for verification? Proposal: SMTP via a free provider, or Mailpit in development for the demo.

## 10. Confirmed Decisions (formerly assumptions, approved 2026-10-10)

- FR-1: the verification link expires after 24h.
- FR-20: duplicate Tracks in a Playlist are refused.
- NFR-8: a secret-scanning check in pre-commit or CI.
- §6: Google only; Facebook not built.
- §9.3: Mailpit (local mail catcher) is acceptable for the demo.
- Playback happens on the Host's phone only, using 30-second previews (FR-16).
- Load target: a single low-end machine via docker compose. Expected capacity is hundreds of concurrent users, to be confirmed by measurement.
