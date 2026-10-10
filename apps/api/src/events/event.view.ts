import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { TrackView } from '../music/track.view.js';
import { LICENSES, VISIBILITIES } from './dto/event.dto.js';
import type { LicenseValue, VisibilityValue } from './dto/event.dto.js';

export class UserRef {
  @ApiProperty({ format: 'uuid' })
  id: string;

  @ApiProperty({ example: 'Karim' })
  displayName: string;
}

export class UserRefList {
  @ApiProperty({ type: [UserRef] })
  items: UserRef[];
}

export class NowPlayingView {
  @ApiProperty({ type: TrackView })
  track: TrackView;

  @ApiProperty({ format: 'date-time' })
  startedAt: string;
}

export class SuggestionView {
  @ApiProperty({ format: 'uuid' })
  id: string;

  @ApiProperty({ type: TrackView })
  track: TrackView;

  @ApiProperty({ example: 3 })
  voteCount: number;

  @ApiProperty({ type: UserRef })
  suggestedBy: UserRef;

  @ApiProperty({ format: 'date-time' })
  createdAt: string;
}

export class EventInfo {
  @ApiProperty({ format: 'uuid' })
  id: string;

  @ApiProperty({ example: "Karim's 25th" })
  name: string;

  @ApiProperty({ example: '' })
  description: string;

  @ApiProperty({ type: UserRef })
  host: UserRef;

  @ApiProperty({ enum: VISIBILITIES })
  visibility: VisibilityValue;

  @ApiProperty({ enum: LICENSES })
  license: LicenseValue;

  @ApiPropertyOptional({ nullable: true, type: Number })
  lat: number | null;

  @ApiPropertyOptional({ nullable: true, type: Number })
  lng: number | null;

  @ApiPropertyOptional({ nullable: true, type: Number })
  radiusM: number | null;

  @ApiPropertyOptional({ nullable: true, type: String, format: 'date-time' })
  startsAt: string | null;

  @ApiPropertyOptional({ nullable: true, type: String, format: 'date-time' })
  endsAt: string | null;
}

/** The shared state of an event: what every viewer sees, and what pushes carry (AD-1). */
export class EventState {
  @ApiProperty({ type: EventInfo })
  event: EventInfo;

  @ApiPropertyOptional({ type: NowPlayingView, nullable: true })
  nowPlaying: NowPlayingView | null;

  @ApiProperty({
    type: [SuggestionView],
    description: 'Ranked: voteCount DESC, then earliest suggested first.',
  })
  queue: SuggestionView[];

  @ApiProperty({
    description:
      'Increases on every change; drop pushes with a version ≤ the one you hold.',
    example: 12,
  })
  version: number;

  @ApiProperty({
    description: 'People connected to the event now.',
    example: 4,
  })
  listeners: number;
}

export const DENY_REASONS = [
  'NOT_INVITED',
  'OUTSIDE_AREA',
  'OUTSIDE_TIME_WINDOW',
  'LOCATION_REQUIRED',
] as const;

export class CanActView {
  @ApiProperty()
  allowed: boolean;

  @ApiPropertyOptional({ enum: DENY_REASONS, nullable: true })
  reason: (typeof DENY_REASONS)[number] | null;
}

/** EventState plus the caller's own fields; only REST returns these (never pushed). */
export class EventDetail extends EventState {
  @ApiProperty()
  isHost: boolean;

  @ApiProperty({ type: CanActView })
  canAct: CanActView;

  @ApiProperty({
    type: [String],
    description: 'Suggestion ids the caller has voted for.',
  })
  myVotes: string[];
}

export const CHANGES = ['queue', 'nowPlaying', 'settings', 'invites'] as const;
export type ChangeKind = (typeof CHANGES)[number];

/** Payload of the `queue.updated` socket event. */
export class QueuePush extends EventState {
  @ApiProperty({
    enum: CHANGES,
    description:
      '`settings` / `invites`: refetch GET /events/:id for your own canAct.',
  })
  change: ChangeKind;
}

export class EventSummary {
  @ApiProperty({ format: 'uuid' })
  id: string;

  @ApiProperty()
  name: string;

  @ApiProperty({ type: UserRef })
  host: UserRef;

  @ApiProperty({ enum: VISIBILITIES })
  visibility: VisibilityValue;

  @ApiProperty({ enum: LICENSES })
  license: LicenseValue;

  @ApiPropertyOptional({ nullable: true, type: String, format: 'date-time' })
  startsAt: string | null;

  @ApiPropertyOptional({ nullable: true, type: String, format: 'date-time' })
  endsAt: string | null;

  @ApiProperty({ description: 'A track is playing now.' })
  live: boolean;

  @ApiPropertyOptional({ type: TrackView, nullable: true })
  nowPlaying: TrackView | null;

  @ApiProperty({ example: 4 })
  listeners: number;
}

export class EventList {
  @ApiProperty({ type: [EventSummary] })
  items: EventSummary[];

  @ApiPropertyOptional({ description: 'Pass as `cursor` for the next page.' })
  nextCursor?: string;
}
