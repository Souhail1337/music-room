---
title: 'UI — YouTube Music–style redesign + Search & play tab'
type: 'feature'
created: '2026-10-10'
status: 'done'
route: 'dispatch'
review_loop_iteration: 0
baseline_commit: 'bdd64dc61673138ab1a86c898979f0abad53041e'
context:
  - '{project-root}/_bmad-output/planning-artifacts/ux-designs/ux-music-room-2026-10-10/DESIGN.md'
  - '{project-root}/_bmad-output/planning-artifacts/ux-designs/ux-music-room-2026-10-10/EXPERIENCE.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** The user wants the app to look and feel like YouTube Music, with red accents, and wants to search any song and listen to it directly, without an event or playlist. Today the only audio is the event host's playback.

**Approach:** Re-skin the whole app through the theme tokens and shared components (near-black canvas, YouTube red `#FF0000` for primary actions, active tab, LIVE badges, play buttons and progress), turn Discover into a YouTube Music–style home with horizontal shelves, and add a **Search** tab that plays Deezer 30-second previews through one app-wide player with a mini-player above the tab bar and a full-screen player.

## Boundaries & Constraints

**Always:** All colors come from `tokens` in `src/theme.ts` (no hard-coded hex in screens). Previews are fetched fresh from `GET /music/tracks/:id/preview` right before playing and never stored (AD-8); the app never calls Deezer. Only one audio source plays at a time: starting standalone playback stops the event host's playback and vice versa. Every existing flow (auth, events, voting, playlists, profile, friends) keeps working with unchanged behavior and copy. 48dp touch targets, TalkBack labels, Android font scaling. Update DESIGN.md (tokens + brand section) and EXPERIENCE.md (IA: Search tab, mini-player; shelves are swipeable rows, not auto-playing carousels) to match.

**Decisions:** Tabs: **Home** (was Discover; same data) · **Search** · Events · Playlists · Profile. Palette: canvas `#030303`, raised `#121212`, overlay `#212121`, ink `#FFFFFF` / `#AAAAAA`, accent red `#FF0000` (pressed `#CC0000`), hairline `#272727`; the voted state uses the accent red (replaces green). Home: app header (logo + search icon → Search tab + profile avatar), filter chips (All · Events · Playlists), shelves "Live now", "Events", "Playlists" with square artwork cards. Search tab: debounced Deezer search (reuses `useTrackSearch`), result rows with a play button; tapping a row plays it. Mini-player: artwork, title, artist, play/pause, close, thin red progress line; tapping it opens a full-screen player (large artwork, title/artist, seek bar, play/pause). No queue / next track. Preview ends → player stops at the end.

**Never:** Backend changes. Full-length streaming. Light theme. Adding tracks to playlists or events from the Search tab. Background playback / lock-screen controls. Changing API contracts or business rules.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Play from Search | tap a result | preview URL fetched, plays; mini-player shows the track | no preview → snackbar "No preview for this track."; music down → "Music search is unavailable right now." |
| Switch track | tap another result while playing | previous stops, new one plays | — |
| Navigate | change tabs / open screens | mini-player stays visible above the tab bar and keeps playing | — |
| Host plays event | standalone preview playing, host taps Play in an event | standalone stops, host audio plays | — |
| Standalone during event | host audio playing, user plays from Search | host audio pauses; event screen shows Play again | — |
| Close | tap close on mini-player | audio stops, mini-player hidden | — |
| Log out | logged in with a track playing | audio stops, player cleared | — |

</frozen-after-approval>

## Code Map

- `apps/mobile/src/theme.ts` -- `tokens.colors` + Paper `paperTheme` + `navigationTheme`; change values here first so every screen re-skins
- `apps/mobile/app/(tabs)/_layout.tsx` -- `Tabs` (expo-router/js-tabs) with 4 screens; add `search`, rename Discover's title to Home, style the tab bar (canvas background, red active tint); host the mini-player above the tab bar (`tabBar` prop or a wrapper)
- `apps/mobile/app/(tabs)/discover/index.tsx` -- current Discover (search bar + events + playlists lists); rebuild as the Home layout using the same hooks (`useEventList`, `usePlaylistList`)
- `apps/mobile/src/api/queries.ts` -- `useTrackSearch`; `apps/mobile/src/api/music.ts` -- `musicApi` search + preview, `Track`
- `apps/mobile/src/events/useHostPlayer.ts` -- the host's `useAudioPlayer`; integrate with the new one-audio-at-a-time rule (e.g. a shared audio-focus module both players subscribe to)
- `apps/mobile/src/ui/components.tsx`, `src/events/components.tsx` (`TrackRow`, `Chip`, `EventCard`, `EmptyState`, `SkeletonRows`), `src/playlists/components.tsx` (`AvatarStack`, playlist cards), `src/profile/components.tsx` -- restyle to the new look
- `apps/mobile/src/auth/AuthProvider.tsx` -- sign-out path: stop and clear the player
- `apps/mobile/app/_layout.tsx` -- root providers; mount the player provider inside auth

## Tasks & Acceptance

**Execution:**
- [x] `apps/mobile/src/theme.ts`, `_bmad-output/planning-artifacts/ux-designs/ux-music-room-2026-10-10/{DESIGN,EXPERIENCE}.md` -- new palette and brand notes; IA updated
- [x] `apps/mobile/src/player/*` -- app-wide player (provider + hook: `play(track)`, `toggle()`, `stop()`, `seek()`, status), audio focus shared with `useHostPlayer`, fresh preview fetch, error snackbars
- [x] `apps/mobile/app/(tabs)/_layout.tsx`, `app/(tabs)/search/{_layout,index}.tsx`, `src/player/MiniPlayer.tsx`, `app/player.tsx` (full-screen modal, registered in `app/_layout.tsx`) -- Search tab, mini-player, full player
- [x] `apps/mobile/app/(tabs)/discover/index.tsx` + shared components -- Home with chips and shelves; restyle cards, rows, buttons, chips, tab bar, headers across events, playlists, profile, friends, settings, auth screens
- [x] `apps/mobile/app/events/[id]/index.tsx`, `src/events/useHostPlayer.ts` -- host playback respects audio focus; voted state in accent red

**Acceptance Criteria:**
- Given the app on the emulator, when any tab is opened, then the canvas is near-black, the active tab and primary buttons are red, and no screen shows the old violet.
- Given the Search tab, when the user searches "daft punk" and taps a result, then the preview plays within ~2s and the mini-player shows it on every tab until closed.
- Given the mini-player, when the user taps it, then the full-screen player opens with large artwork, a working seek bar and play/pause.
- Given the event host is playing, when the host starts a preview from Search, then only one audio source is heard.

## Implementation Notes

## Spec Change Log

## Review Triage Log

## Verification

**Commands:**
- `cd apps/mobile && npx tsc --noEmit && npx expo lint` -- expected: clean
- `cd apps/mobile && grep -rnE "#8B5CF6|#7C3AED" app src` -- expected: no matches
- `cd apps/mobile && npx expo export --platform android --output-dir /tmp/mr-export` -- expected: bundles

**Manual checks:**
- Emulator: Home shelves render with artwork; Search → play → switch tabs (mini-player persists) → open full player → seek → close; an event screen still votes (voted = red) and host Play/Skip still work.
