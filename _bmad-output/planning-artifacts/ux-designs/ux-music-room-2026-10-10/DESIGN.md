---
name: Music Room
description: Collaborative music app for parties and shared playlists. Dark-only, one electric accent, the music is the hero.
title: Music Room — DESIGN
status: final
created: 2026-10-10
updated: 2026-10-10
sources:
  - musicc.pdf
  - _bmad-output/planning-artifacts/prds/prd-music-room-2026-10-10/prd.md
colors:
  surface-base: '#0E0E12'
  surface-raised: '#18181F'
  surface-overlay: '#22222B'
  ink-primary: '#F2F1F7'
  ink-secondary: '#A09FB0'
  ink-disabled: '#5A5966'
  accent: '#8B5CF6'
  accent-pressed: '#7C3AED'
  on-accent: '#FFFFFF'
  vote-active: '#22C55E'
  live: '#F43F5E'
  warning: '#F59E0B'
  error: '#EF4444'
  border-hairline: '#2A2A34'
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
---

## Brand & Style


Music Room is **"Afterhours"**: it should feel like the room after the lights go down. The canvas is near-black, the content is the album art, and there is one electric violet that means "you can act here". The app sits under the party, not on top of it. Screens stay calm so that what moves is meaningful: a track climbing the queue, a collaborator's edit landing in your playlist.

The app is dark-only. It's used in dim rooms, at night, and next to speakers, so a light theme would be out of place and it costs time to build.

## Colors

- **Club Black (`#0E0E12`)** is the canvas. It's slightly cool so album art pops.
- **Raised (`#18181F`) / Overlay (`#22222B`)** are tonal steps for cards, sheets and toasts. Depth comes from tone, not shadow.
- **Electric Violet (`#8B5CF6`)** is the only brand accent. Use it for primary actions, the active tab and focus. Never use it as decoration or for vote state.
- **Vote Green (`#22C55E`)** means exactly one thing: *you voted for this track*. Don't use it anywhere else.
- **Live Red (`#F43F5E`)** is used only for the `LIVE` badge on an event that is playing now.
- **Warning / Error** are for permission problems (outside the voting zone or window) and failed actions. Use them as text and icon color, never as full-width red fills.
- **Hairline (`#2A2A34`)** is for dividers and secondary button borders.

Avoid gradients (except album-art-derived backdrops, if time allows), neon glows and more than one accent on screen at a time.

## Typography

Use the platform conventions: Material 3 type roles through React Native Paper, with Roboto as the system font. Respect Android font scaling at every level.

- `display` appears once in the whole app: the Now Playing track title.
- `title` is for screen and section headers.
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
- **Vote button**: an up-arrow icon with the count beneath it. Idle is `ink-secondary`. Voted is `vote-active` with a filled icon. The hit area is 48dp even though the icon is smaller.
- **Now Playing card**: `surface-raised`, `rounded.lg`, 96px artwork, title in `display`, artist in `meta`, and a thin progress bar in `accent`.
- **Event card** (Discover / Events): cover art, event name (`title`), host and listener count (`meta`), a `live-badge` when playing, and a `chip-visibility` reading Public or Private.
- **Playlist card**: like the event card, plus a stack of up to 3 collaborator avatars.
- **Visibility / license chips**: `Public` · `Private` · `Invited can vote` · `On-site 16:00–18:00`. They are read-only on detail screens and selectable on create/edit forms.
- **Toast**: `surface-overlay` with one line of text and an optional action. Used for conflict notices ("Sam moved this track").
- **Buttons**: the primary is a filled violet pill. The secondary is an outlined pill. Use at most one primary per screen.

## Do's and Don'ts

| Do | Don't |
|---|---|
| Let album art carry the color | Add colorful backgrounds or gradients behind lists |
| Keep one violet primary action per screen | Put violet on vote state or decoration |
| Use green only for "you voted" | Reuse green for success toasts |
| Use tone steps for depth | Use drop shadows or glows |
| Use Material 3 / Android conventions | Build a custom nav drawer or iOS-style controls |
