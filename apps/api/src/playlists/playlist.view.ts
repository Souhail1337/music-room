import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { UserRef } from '../events/event.view.js';
import { TrackView } from '../music/track.view.js';
import {
  PLAYLIST_LICENSES,
  PLAYLIST_VISIBILITIES,
} from './dto/playlist.dto.js';
import type {
  PlaylistLicenseValue,
  PlaylistVisibilityValue,
} from './dto/playlist.dto.js';

export class PlaylistInfo {
  @ApiProperty({ format: 'uuid' })
  id: string;

  @ApiProperty({ example: 'Road trip ☀️' })
  name: string;

  @ApiProperty({ example: '' })
  description: string;

  @ApiProperty({ type: UserRef })
  owner: UserRef;

  @ApiProperty({ enum: PLAYLIST_VISIBILITIES })
  visibility: PlaylistVisibilityValue;

  @ApiProperty({ enum: PLAYLIST_LICENSES })
  license: PlaylistLicenseValue;
}

export class PlaylistEntryView {
  @ApiProperty({
    format: 'uuid',
    description: 'Entry id (use it to move or remove).',
  })
  id: string;

  @ApiProperty({ type: TrackView })
  track: TrackView;

  @ApiProperty({ example: 0, description: '0-based; always contiguous.' })
  position: number;

  @ApiProperty({ type: UserRef })
  addedBy: UserRef;
}

/** The shared state of a playlist: what every viewer sees, and what pushes carry (AD-1, AD-3). */
export class PlaylistState {
  @ApiProperty({ type: PlaylistInfo })
  playlist: PlaylistInfo;

  @ApiProperty({
    type: [PlaylistEntryView],
    description: 'Ordered by position (0..n-1).',
  })
  tracks: PlaylistEntryView[];

  @ApiProperty({
    example: 7,
    description:
      'Increases on every accepted change. Send it back as `baseVersion`; drop pushes with a version ≤ the one you hold.',
  })
  version: number;

  @ApiPropertyOptional({
    type: UserRef,
    nullable: true,
    description:
      'Who made the last accepted change (track edit, settings or invites).',
  })
  lastEditor: UserRef | null;
}

export const PLAYLIST_DENY_REASONS = ['READ_ONLY'] as const;

export class CanEditView {
  @ApiProperty()
  allowed: boolean;

  @ApiPropertyOptional({ enum: PLAYLIST_DENY_REASONS, nullable: true })
  reason: (typeof PLAYLIST_DENY_REASONS)[number] | null;
}

/** PlaylistState plus the caller's own fields; only REST returns these (never pushed). */
export class PlaylistDetail extends PlaylistState {
  @ApiProperty()
  isOwner: boolean;

  @ApiProperty({ type: CanEditView })
  canEdit: CanEditView;

  @ApiProperty({
    type: [UserRef],
    description:
      'People with the playlist open right now (live updates come as `presence.updated`).',
  })
  viewers: UserRef[];
}

export const PLAYLIST_CHANGES = ['tracks', 'settings', 'invites'] as const;
export type PlaylistChangeKind = (typeof PLAYLIST_CHANGES)[number];

/** Payload of the `playlist.updated` socket event. */
export class PlaylistPush extends PlaylistState {
  @ApiProperty({ example: 'playlist:3f1c…' })
  room: string;

  @ApiProperty({
    enum: PLAYLIST_CHANGES,
    description:
      '`settings` / `invites`: refetch GET /playlists/:id for your own canEdit.',
  })
  change: PlaylistChangeKind;
}

/** `details` of a 409 VERSION_CONFLICT. */
export class VersionConflictDetails {
  @ApiProperty({ type: PlaylistState })
  playlist: PlaylistState;

  @ApiPropertyOptional({
    type: UserRef,
    nullable: true,
    description: 'Who made the winning (latest accepted) change.',
  })
  lastEditor: UserRef | null;
}

export class PlaylistSummary {
  @ApiProperty({ format: 'uuid' })
  id: string;

  @ApiProperty()
  name: string;

  @ApiProperty({ type: UserRef })
  owner: UserRef;

  @ApiProperty({ enum: PLAYLIST_VISIBILITIES })
  visibility: PlaylistVisibilityValue;

  @ApiProperty({ enum: PLAYLIST_LICENSES })
  license: PlaylistLicenseValue;

  @ApiProperty({ example: 12 })
  trackCount: number;

  @ApiPropertyOptional({
    nullable: true,
    type: String,
    description: 'Artwork of the first track.',
  })
  artworkUrl: string | null;

  @ApiProperty({
    type: [UserRef],
    description: 'Up to 3 collaborators: the owner, then the first invitees.',
  })
  collaborators: UserRef[];
}

export class PlaylistList {
  @ApiProperty({ type: [PlaylistSummary] })
  items: PlaylistSummary[];

  @ApiPropertyOptional({ description: 'Pass as `cursor` for the next page.' })
  nextCursor?: string;
}
