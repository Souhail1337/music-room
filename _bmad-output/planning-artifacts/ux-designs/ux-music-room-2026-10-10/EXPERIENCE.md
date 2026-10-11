---
name: Music Room
title: Music Room — EXPERIENCE
status: final
created: 2026-10-10
updated: 2026-10-10
sources:
  - musicc.pdf
  - _bmad-output/planning-artifacts/prds/prd-music-room-2026-10-10/prd.md
---

# Music Room — Experience Spine


## Foundation

- **Form factor:** a single-surface Android phone app (subject IV.2, V.5). A responsive web version is a bonus and out of scope.
- **UI system:** React Native Paper (Material 3) on Expo. Android conventions apply: back gesture, bottom navigation, bottom sheets, snackbars.
- **Visual identity:** `DESIGN.md`. Dark-only.
- **Services in scope:** Music Track Vote and Music Playlist Editor. Control Delegation is out of scope.
- **Remote control principle (V.5):** the app holds no authoritative state. Every list, vote count and permission comes from the backend, and changes arrive in real time.

## Information Architecture

Bottom navigation has 5 tabs: **Home · Search · Events · Playlists · Profile**. While a preview plays, a **mini-player** sits directly above the tab bar on every tab.

| Surface | Reached from | Purpose |
|---|---|---|
| Welcome | First launch, logged out | Choose Sign up / Log in / Continue with Google / Continue with Facebook |
| Sign up (email) | Welcome | Email, password and display name, then the "Check your email" screen |
| Check your email | Sign up | Explains verification; Resend; "I've verified" refresh |
| Log in | Welcome | Email/password and social buttons; "Forgot password?" |
| Forgot / Reset password | Log in | Request a reset email, then set a new password from the link |
| Home | Tab, default after login | App header (logo, search icon → Search tab, profile avatar → Profile tab), filter chips (All · Events · Playlists), then shelves: "Live now", "Events", "Playlists" (public only) |
| Search | Tab, Home search icon | Search any song and play its 30-second preview. Nothing is added to events or playlists from here |
| Mini-player | Above the tab bar while a preview is loaded | Artwork, title, artist, play/pause, close, red progress line; tap to open the full-screen player |
| Full-screen player | Mini-player | Large artwork, title/artist, seek bar, play/pause; chevron-down or back closes it |
| Events | Tab | My events (hosting), Invited, Joined; FAB to create an event |
| Create / Edit event | Events FAB, event overflow | Name, description, visibility, vote license (Everyone / Invited only / On-site + time window), location |
| Event (Track Vote) | Event card | Now Playing, a queue ranked by votes, and "Suggest a track" |
| Invite people | Event or playlist overflow | Search users or friends and toggle invites |
| Playlists | Tab | My playlists, Shared with me; FAB to create a playlist |
| Create / Edit playlist | Playlists FAB, overflow | Name, visibility, edit license (Everyone / Invited only) |
| Playlist (Editor) | Playlist card | Live editable list, collaborator presence, Add track |
| Track search (sheet) | "Suggest a track" / "Add track" | Search the catalog and tap to add |
| Profile | Tab | My info in 4 sections: Public, Friends only, Private, Music preferences |
| Edit profile section | Profile | Edit one section's fields |
| Friends | Profile | Friends list, requests, add a friend |
| User profile | Any avatar or name | Another user's profile, showing only what their privacy level allows me to see |
| Settings | Profile overflow | Linked accounts (link Google / Facebook), **Server URL** (V.5), Log out |

There is no navigation drawer. Sheets stack at most one deep.

## Voice and Tone

Keep it short, friendly and direct. Address the user as "you". Don't use exclamation marks for errors.

| Do | Don't |
|---|---|
| "Voted." / "Vote removed." | "Your vote has been successfully registered!" |
| "Only people at the venue between 16:00 and 18:00 can vote." | "Error 403: Forbidden" |
| "Only invited people can vote in this event." | "You don't have permission." |
| "Sam moved *Midnight City* — list updated." | "Conflict detected. Please retry." |
| "Check your email to finish signing up." | "Account pending verification." |
| "Can't reach the server. Check the server URL in Settings." | "Network request failed" |

## Component Patterns

Visual specs live in `DESIGN.md.Components`.

| Component | Use | Behavioral rules |
|---|---|---|
| Vote button | Event queue rows | One vote per user per track. Tap again to remove it. The UI updates optimistically, then reconciles with the server's count. If the vote is not allowed, it reverts and shows a snackbar with the reason. |
| Queue (Track Vote) | Event | Sorted by votes (descending), with ties broken by the time the track was suggested (earliest first). Re-sorts when a server push arrives. Rows that move animate to their new position (200ms). |
| Now Playing card | Event header | The top-voted track becomes Now Playing when the current one ends. Not votable. The host sees Skip and Play/Pause. |
| Editable track list | Playlist | Long-press the drag handle to reorder. Swipe or use the overflow menu to remove. Only shown with edit rights; otherwise the list is read-only and the handles are hidden. |
| Presence avatars | Playlist header | Who is viewing or editing right now. Tap to see the list. |
| Track search sheet | Event / Playlist | Debounced search (300ms). Tapping a result adds it and closes the sheet. A track already in the list shows "Already added". |
| Shelves | Home | Horizontal, swipeable rows of square cards. Never auto-scroll or auto-play. A filter chip hides the shelves of the other kind. Empty shelves are hidden; no public events shows "No public events right now. Create one." |
| Search & play | Search tab | Debounced search (300ms). Tapping a row (or its play button) fetches a fresh preview URL from the API and plays it; tapping the row that is playing pauses it. No preview → snackbar "No preview for this track."; music service down → "Music search is unavailable right now." |
| Standalone player | App-wide | One track at a time, no queue. Playing another track replaces it. A preview that ends stops at the end (Play starts it over). Close stops the audio and hides the mini-player. Logging out stops and clears it. No background or lock-screen playback. |
| Audio focus | App-wide | Only one source is heard: starting a Search preview pauses the event host's playback (the event screen shows Play again), and the host pressing Play pauses the Search preview. |
| Visibility / license chips | Create / Edit forms | Single-select. Choosing "On-site" reveals a location picker and a time window. |
| Snackbar | Global | Feedback, conflicts and permission denials. One at a time. 4s, or until the user acts. |
| Privacy section card | Profile | Each card is labeled with who sees it (Everyone / Friends / Only me). Tap to edit. |

## State Patterns

| State | Surface | Treatment |
|---|---|---|
| Loading | Any list | Skeleton rows (3 to 5). No full-screen spinners after the first load. |
| Empty queue | Event | "No tracks yet. Suggest the first one." with a primary button. |
| Empty playlist | Playlist | "Empty playlist. Add a track to get started." |
| Empty Home | Home | "No public events right now. Create one." |
| Can view, can't vote | Event | Vote buttons are disabled, and a banner above the queue gives the reason (invited-only or on-site window). |
| Outside time window | Event | The banner shows the window: "Voting opens at 16:00." |
| Location permission denied | Event (on-site license) | Banner: "Allow location to vote at this event," with a button that opens Android settings. |
| Private, not invited | Event / Playlist link | "This event is private." Show no content. |
| Read-only playlist | Playlist | Drag handles and Add are hidden. Header chip: "View only." |
| Concurrent edit conflict | Playlist | The server state wins. The list snaps to the server order and a snackbar names the editor. The user's move is not silently re-applied. |
| Real-time disconnected | Event / Playlist | A thin warning bar: "Reconnecting…". Actions are disabled until the connection is back, then the app refetches the full state. |
| Server unreachable | Global | Full-screen message with Retry and a "Server URL" link to Settings. |
| Unverified email | After email sign-up | The app is blocked on "Check your email" until the address is verified. |

## Interaction Primitives

- Tap acts. Long-press on the drag handle reorders.
- Swipe left on a playlist row to remove it, with an Undo snackbar.
- Pull-to-refresh works on Home, Events, Playlists and Friends. Live screens update via push, but pull-to-refresh is a manual fallback there too.
- FAB on Events and Playlists for Create.
- Android back always closes the top sheet first.
- Home shelves are plain horizontal scroll rows the user swipes; they are not carousels.
- **Banned:** auto-advancing carousels, auto-playing hero media and nested modals.

## Accessibility Floor

Visual contrast lives in `DESIGN.md`.

- TalkBack labels include role and state, for example: "Vote for Midnight City, 12 votes, voted."
- Vote-count changes and reorders are announced politely, not on every push. Announce only when *my* track changes position.
- Reordering is also possible without dragging: overflow menu → "Move up" / "Move down".
- Touch targets are at least 48dp. Respect Android font scaling with no truncated controls.
- Respect Android "Remove animations": no row-move animation, just re-render.

## Key Flows

### Flow 1: First launch and verified account (Yasmine, on the train home)

1. Yasmine opens Music Room for the first time and sees Welcome.
2. She taps **Sign up**, enters her email, password and name, and submits.
3. The "Check your email" screen appears. She opens her mail app and taps the link.
4. She returns and taps "I've verified". The app checks with the server.
5. **Climax:** she lands on Home, its "Live now" shelf already filled with live public events.

Failure: she forgets her password a week later. Log in → "Forgot password?" → email → link → new password → logged in.
Alt: **Continue with Google** skips steps 2–4 and goes straight to Home.

### Flow 2: Voting at a party (Yasmine, Saturday night, at Karim's flat)

1. Karim (the host) has created the public event "Karim's 25th" with the license "On-site, 20:00–02:00".
2. Yasmine opens Home and sees the event card with **LIVE** in the "Live now" shelf.
3. She taps it. The Event screen shows Now Playing and the ranked queue.
4. Android asks for location permission and she allows it.
5. She taps **Suggest a track**, searches "Daft Punk", and taps *One More Time*. It joins the bottom of the queue with 1 vote (hers).
6. Friends in the room vote. Her track climbs, and the rows animate up in real time.
7. **Climax:** *One More Time* reaches the top and becomes Now Playing. The room cheers.

Failure: Yasmine's cousin, at home, opens the same event. The vote buttons are disabled, and the banner says "Only people at the venue between 20:00 and 02:00 can vote."
Concurrency: two people vote for the same track in the same second. Both votes count, and the count increments by 2 on every screen.

### Flow 3: Building a road-trip playlist together (Yasmine and Sam, two phones, same evening)

1. Yasmine creates the private playlist "Road trip ☀️" with "Invited only can edit".
2. Overflow → **Invite** → she picks Sam from Friends.
3. Sam gets the playlist under Playlists → Shared with me and opens it. Both see each other's avatars in the header.
4. Each adds tracks. New rows appear on the other phone within a second.
5. Yasmine drags track 7 to position 1 while Sam drags the same track to position 3.
6. The server accepts the first move it receives. The other phone snaps to the server order, and a snackbar shows "Yasmine moved *Midnight City* — list updated."
7. **Climax:** both phones show the same playlist in the same order, and the playlist is ready for Saturday.

Failure: Sam's friend (not invited) gets a link and sees "This playlist is private."

### Flow 4: Just listening (Yasmine, on the bus)

1. Yasmine opens the **Search** tab and types "daft punk".
2. She taps *One More Time*. The preview starts and the mini-player appears above the tab bar.
3. She switches to Playlists; the mini-player stays and the music keeps playing.
4. She taps the mini-player. The full-screen player opens; she drags the seek bar to the chorus.
5. **Climax:** she closes the player with the chevron, keeps browsing, and taps **×** on the mini-player when she arrives.

Failure: a track has no preview. A snackbar says "No preview for this track." and nothing else changes.

## Settings: Server URL (V.5)

The subject says the backend address must be configurable for testing.

- It lives at Settings → Server URL, with a text field and a **Test connection** button.
- It is also reachable from the "Server unreachable" screen and from a long-press on the Welcome logo, so the URL can be set *before* logging in.
- It is saved on the device. Changing it logs the user out.

## Inspiration & Anti-patterns

- **From Spotify Jam:** a shared queue that updates live on everyone's phone.
- **From Google Docs:** presence avatars, and "who changed it" attribution on conflicts.
- **Rejected:** gamified voting (leaderboards, streaks). It distracts from the music.
- **Rejected:** silent last-write-wins in the playlist. The subject explicitly asks for concurrency handling, so the user is always told when their edit was overridden.
