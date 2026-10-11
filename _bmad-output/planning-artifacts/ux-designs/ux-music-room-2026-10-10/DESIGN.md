---
name: Music Room
description: Collaborative music app for parties and shared playlists. YouTube Music–style, dark-only, one red accent, the music is the hero.
title: Music Room — DESIGN
status: final
created: 2026-10-10
updated: 2026-10-10
sources:
  - musicc.pdf
  - _bmad-output/planning-artifacts/prds/prd-music-room-2026-10-10/prd.md
colors:
  surface-base: '#030303'
  surface-raised: '#121212'
  surface-overlay: '#212121'
  ink-primary: '#FFFFFF'
  ink-secondary: '#AAAAAA'
  ink-disabled: '#5F5F5F'
  accent: '#FF0000'
  accent-pressed: '#CC0000'
  on-accent: '#FFFFFF'
  vote-active: '{colors.accent}'
  live: '{colors.accent}'
  warning: '#F59E0B'
  error: '#EF4444'
  border-hairline: '#272727'
  progress-track: 'rgba(255, 255, 255, 0.2)'
typography:
  display:
    note: 'Android Headline Medium (Material 3) — Now Playing title only'
  title:
    note: 'Android Title Large (Material 3)'
  body:
    note: 'Android Body Large (Material 3)'
  label:
    note: 'Android Label Large (Material 3) — buttons, chips'
  meta:
    note: 'Android Body Small (Material 3) — artist, counts, timestamps'
rounded:
  sm: 8px
  md: 12px
  lg: 20px
  full: 9999px
spacing:
  '1': 4px
  '2': 8px
  '3': 12px
  '4': 16px
  '5': 24px
  '6': 32px
  margin-mobile: 16px
components:
  button-primary:
    background: '{colors.accent}'
    text: '{colors.on-accent}'
    rounded: '{rounded.full}'
    height: 48px
  button-secondary:
    background: transparent
    border: '{colors.border-hairline}'
    text: '{colors.ink-primary}'
    rounded: '{rounded.full}'
    height: 48px
  track-row:
    background: '{colors.surface-base}'
    artwork-size: 48px
    artwork-rounded: '{rounded.sm}'
    min-height: 64px
  vote-button:
    idle-icon: '{colors.ink-secondary}'
    active-icon: '{colors.vote-active}'
    count-text: '{typography.meta}'
    hit-area: 48px
  now-playing-card:
    background: '{colors.surface-raised}'
    rounded: '{rounded.lg}'
    artwork-size: 96px
  event-card:
    background: '{colors.surface-raised}'
    rounded: '{rounded.md}'
  chip-visibility:
    background: '{colors.surface-overlay}'
    text: '{colors.ink-secondary}'
    rounded: '{rounded.full}'
  live-badge:
    background: '{colors.live}'
    text: '{colors.on-accent}'
    rounded: '{rounded.full}'
  toast:
    background: '{colors.surface-overlay}'
    text: '{colors.ink-primary}'
    rounded: '{rounded.md}'
  tab-bar:
    background: '{colors.surface-base}'
    active: '{colors.accent}'
    inactive: '{colors.ink-secondary}'
    border: '{colors.border-hairline}'
  shelf-card:
    artwork-size: 148px
    artwork-rounded: '{rounded.sm}'
    title: '{typography.title}'
    meta: '{typography.meta}'
  filter-chip:
    background: '{colors.surface-overlay}'
    selected-background: '{colors.ink-primary}'
    selected-text: '{colors.surface-base}'
    rounded: '{rounded.sm}'
  mini-player:
    background: '{colors.surface-raised}'
    artwork-size: 40px
    progress: '{colors.accent}'
    progress-height: 2px
    min-height: 56px
  full-player:
    background: '{colors.surface-base}'
    artwork-size: 'screen width - 64px (max 360px)'
    seek-fill: '{colors.accent}'
    seek-track: '{colors.progress-track}'
    play-button: 72px, '{colors.ink-primary}' fill, '{colors.surface-base}' icon
---

## Brand & Style


Music Room looks and feels like **YouTube Music**: a near-black canvas, white type, square album art everywhere, and one pure red (`#FF0000`) that means "act here" or "this is on". The home screen is a stack of horizontal shelves; a mini-player follows you above the tab bar while a preview plays. Screens stay calm so that what moves is meaningful: a track climbing the queue, a collaborator's edit landing in your playlist, the red progress line of what you are hearing.

The app is dark-only. It's used in dim rooms, at night, and next to speakers, so a light theme would be out of place and it costs time to build.

## Colors

- **Canvas (`#030303`)** is the background of every screen and the tab bar. Album art pops against it.
- **Raised (`#121212`) / Overlay (`#212121`)** are tonal steps for cards, the mini-player, sheets, chips and toasts. Depth comes from tone, not shadow.
- **Ink (`#FFFFFF` / `#AAAAAA`)**: white for titles, grey for artists, counts and meta.
- **YouTube Red (`#FF0000`, pressed `#CC0000`)** is the only accent. Use it for primary buttons, the active tab, the `LIVE` badge, play buttons, progress bars and the **voted** state (filled red arrow). Never use it as decoration or as a full-width fill behind content.
- **Warning / Error** are for permission problems (outside the voting zone or window) and failed actions. Use them as text and icon color, never as full-width fills.
- **Hairline (`#272727`)** is for dividers, the tab bar's top border and secondary button borders.

Avoid gradients (except album-art-derived backdrops, if time allows), neon glows and any second accent color.

## Typography

Use the platform conventions: Material 3 type roles through React Native Paper, with Roboto as the system font. Respect Android font scaling at every level.

- `display` appears for the Now Playing track title (event) and the full-screen player's track title.
- `title` is for screen headers and shelf titles (bold).
- `body` is for track titles in lists.
- `meta` is for artist names, vote counts and "edited by" stamps.
- Never use all-caps except inside `live-badge`.

## Layout & Spacing

The scale is 4 / 8 / 12 / 16 / 24 / 32. Page margins are 16dp (`{spacing.margin-mobile}`). Every screen is a single column. Lists are dense: 64dp track rows with 8dp between artwork and text. Major sections are separated by 24dp.

## Elevation & Depth

Use no shadows. Hierarchy comes from tone (`surface-base` → `surface-raised` → `surface-overlay`). Bottom sheets and toasts use `surface-overlay`. The Now Playing card is the only `rounded.lg` surface, which marks it as the anchor of the event screen.

## Shapes

- `rounded.sm` (8px): artwork thumbnails and inputs.
- `rounded.md` (12px): cards and toasts.
- `rounded.lg` (20px): Now Playing card and bottom sheet top corners.
- `rounded.full`: buttons, chips, badges and avatars.

## Components

- **Track row**: 48px artwork, title (`body`) over artist (`meta`), and a trailing slot. In an event the trailing slot is the vote button. In an editable playlist it is a drag handle plus an overflow menu.
- **Vote button**: an up-arrow icon with the count beneath it. Idle is `ink-secondary` with an outlined icon. Voted is the accent red with a filled icon (the shape change keeps it distinguishable without color). The hit area is 48dp even though the icon is smaller.
- **Now Playing card**: `surface-raised`, `rounded.lg`, 96px artwork, title in `display`, artist in `meta`, and a thin progress bar in `accent`.
- **Event card** (Events tab): cover art, event name (`title`), host and listener count (`meta`), a `live-badge` when playing, and a `chip-visibility` reading Public or Private.
- **Playlist card**: like the event card, plus a stack of up to 3 collaborator avatars.
- **Visibility / license chips**: `Public` · `Private` · `Invited can vote` · `On-site 16:00–18:00`. They are read-only on detail screens and selectable on create/edit forms.
- **Shelf** (Home): a bold `title` over a horizontally swipeable row of `shelf-card`s (148px square artwork, two-line title, one meta line). The `LIVE` badge sits on the artwork's top-left corner. Shelves never auto-scroll.
- **Filter chips** (Home): `All` · `Events` · `Playlists`, single-select. The selected chip is white with black text, the others `surface-overlay`.
- **Search result row**: a track row whose trailing slot is a play/pause circle icon. The row that is in the player has its title and icon in red.
- **Mini-player**: `surface-raised`, above the tab bar on every tab: 2px red progress line on top, 40px artwork, title over artist, play/pause and close. Tapping the text opens the full-screen player.
- **Full-screen player**: chevron-down to close, large square artwork, title (`display`, bold) over artist, a seek bar (red fill and thumb on a translucent track, elapsed / total times) and a 72px white round play/pause button.
- **Tab bar**: `surface-base` with a hairline top border; active icon and label red, inactive `ink-secondary`.
- **Toast**: `surface-overlay` with one line of text and an optional action. Used for conflict notices ("Sam moved this track").
- **Buttons**: the primary is a filled red pill. The secondary is an outlined pill. Use at most one primary per screen.

## Do's and Don'ts

| Do | Don't |
|---|---|
| Let album art carry the color | Add colorful backgrounds or gradients behind lists |
| Keep red for actions, live, progress and "you voted" | Use red as decoration or a large fill |
| Keep one red primary button per screen | Introduce a second accent color |
| Use tone steps for depth | Use drop shadows or glows |
| Use Material 3 / Android conventions | Build a custom nav drawer or iOS-style controls |
