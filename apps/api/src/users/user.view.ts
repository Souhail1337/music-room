import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import type { User } from '../generated/prisma/client.js';

/** The caller's own account (auth responses and `GET /me`). Other users only ever get a ProfileView or a summary. */
export class MeView {
  @ApiProperty({ format: 'uuid' })
  id: string;

  @ApiProperty({ example: 'yasmine@example.com' })
  email: string;

  @ApiProperty({ example: 'Yasmine' })
  displayName: string;

  @ApiProperty()
  emailVerified: boolean;

  @ApiProperty({ description: 'A Google account is linked.' })
  hasGoogle: boolean;

  @ApiProperty({ description: 'The account can log in with a password.' })
  hasPassword: boolean;

  @ApiProperty({ format: 'date-time' })
  createdAt: string;

  static of(user: User): MeView {
    return {
      id: user.id,
      email: user.email,
      displayName: user.displayName,
      emailVerified: user.emailVerifiedAt !== null,
      hasGoogle: user.googleSub !== null,
      hasPassword: user.passwordHash !== null,
      createdAt: user.createdAt.toISOString(),
    };
  }
}

/** The only user fields other people may see in search results. */
export class UserSummary {
  @ApiProperty({ format: 'uuid' })
  id: string;

  @ApiProperty({ example: 'Sam' })
  displayName: string;

  @ApiProperty({ description: 'You are friends (friends are listed first).' })
  isFriend: boolean;
}

export class UserSummaryList {
  @ApiProperty({ type: [UserSummary] })
  items: UserSummary[];
}

// --- Profile (FR-6, FR-7, AD-7) ------------------------------------------------------------------

export const FRIENDSHIP_STATES = [
  'none',
  'friends',
  'incoming',
  'outgoing',
  'self',
] as const;
export type FriendshipState = (typeof FRIENDSHIP_STATES)[number];

/** How the viewer relates to another user; computed by the friends repository. */
export interface Relation {
  friendship: Exclude<FriendshipState, 'self'>;
  /** The pending request, when `incoming` or `outgoing`. */
  requestId?: string;
}

export const NO_RELATION: Relation = { friendship: 'none' };

export class PublicInfo {
  @ApiPropertyOptional({
    maxLength: 280,
    example: 'House music and long drives.',
  })
  bio?: string;

  @ApiPropertyOptional({ maxLength: 60, example: 'Lyon' })
  city?: string;
}

export class FriendsInfo {
  @ApiPropertyOptional({ maxLength: 30, example: '+33 6 12 34 56 78' })
  phone?: string;

  @ApiPropertyOptional({ format: 'date', example: '1999-04-23' })
  birthday?: string;
}

export class PrivateInfo {
  @ApiPropertyOptional({ maxLength: 80, example: 'Yasmine Benali' })
  fullName?: string;

  @ApiPropertyOptional({ maxLength: 200, example: '12 rue de la Paix, Lyon' })
  address?: string;
}

export class MusicPrefs {
  @ApiProperty({ type: [String], maxItems: 10, example: ['House', 'Funk'] })
  genres: string[];

  @ApiProperty({ type: [String], maxItems: 10, example: ['Daft Punk'] })
  artists: string[];
}

function asRecord(json: unknown): Record<string, unknown> {
  return json && typeof json === 'object' && !Array.isArray(json)
    ? (json as Record<string, unknown>)
    : {};
}

/** Copies only the known, non-empty string fields of a stored section: nothing else can leak out of the JSON. */
function readStrings<K extends string>(
  json: unknown,
  keys: readonly K[],
): Partial<Record<K, string>> {
  const source = asRecord(json);
  const out: Partial<Record<K, string>> = {};
  for (const key of keys) {
    const value = source[key];
    if (typeof value === 'string' && value !== '') out[key] = value;
  }
  return out;
}

function readList(json: unknown, key: string): string[] {
  const value = asRecord(json)[key];
  return Array.isArray(value)
    ? value.filter((v): v is string => typeof v === 'string' && v !== '')
    : [];
}

export const PUBLIC_KEYS = ['bio', 'city'] as const;
export const FRIENDS_KEYS = ['phone', 'birthday'] as const;
export const PRIVATE_KEYS = ['fullName', 'address'] as const;
export const MUSIC_KEYS = ['genres', 'artists'] as const;

/**
 * A user as another user (or the user themself) may see them (AD-7). This is the only way profile
 * data leaves the API: `public` and `musicPrefs` for everyone, `friends` only for friends and self,
 * `private` only for self. Hidden sections are absent, never `null`. Email is never included.
 */
export class ProfileView {
  @ApiProperty({ format: 'uuid' })
  id: string;

  @ApiProperty({ example: 'Yasmine' })
  displayName: string;

  @ApiProperty({ type: PublicInfo, description: 'Visible to everyone.' })
  public: PublicInfo;

  @ApiProperty({ type: MusicPrefs, description: 'Visible to everyone.' })
  musicPrefs: MusicPrefs;

  @ApiPropertyOptional({
    type: FriendsInfo,
    description: 'Only present for friends and for yourself.',
  })
  friends?: FriendsInfo;

  @ApiPropertyOptional({
    type: PrivateInfo,
    description: 'Only present on your own profile.',
  })
  private?: PrivateInfo;

  @ApiProperty({
    enum: FRIENDSHIP_STATES,
    description:
      '`incoming`: they asked you; `outgoing`: you asked them; `self`: your own profile.',
  })
  friendship: FriendshipState;

  @ApiPropertyOptional({
    format: 'uuid',
    description:
      'The pending friend request (accept/decline it if `incoming`, cancel it if `outgoing`).',
  })
  requestId?: string;

  static for(
    viewerId: string,
    target: User,
    relation: Relation = NO_RELATION,
  ): ProfileView {
    const self = viewerId === target.id;
    const view: ProfileView = {
      id: target.id,
      displayName: target.displayName,
      public: readStrings(target.publicInfo, PUBLIC_KEYS),
      musicPrefs: {
        genres: readList(target.musicPrefs, 'genres'),
        artists: readList(target.musicPrefs, 'artists'),
      },
      friendship: self ? 'self' : relation.friendship,
    };
    if (self || relation.friendship === 'friends')
      view.friends = readStrings(target.friendsInfo, FRIENDS_KEYS);
    if (self) view.private = readStrings(target.privateInfo, PRIVATE_KEYS);
    if (!self && relation.requestId) view.requestId = relation.requestId;
    return view;
  }
}

// --- Friends (FR-8) ------------------------------------------------------------------------------

export class FriendView {
  @ApiProperty({ format: 'uuid' })
  id: string;

  @ApiProperty({ example: 'Sam' })
  displayName: string;

  @ApiProperty({ format: 'date-time', description: 'Friends since.' })
  since: string;
}

export class FriendList {
  @ApiProperty({ type: [FriendView], description: 'Sorted by display name.' })
  items: FriendView[];
}

export class FriendRequestUser {
  @ApiProperty({ format: 'uuid' })
  id: string;

  @ApiProperty({ example: 'Sam' })
  displayName: string;
}

export class FriendRequestView {
  @ApiProperty({ format: 'uuid' })
  id: string;

  @ApiProperty({
    type: FriendRequestUser,
    description:
      'The other person: who asked you (incoming) or whom you asked (outgoing).',
  })
  user: FriendRequestUser;

  @ApiProperty({ format: 'date-time' })
  createdAt: string;
}

export class FriendRequests {
  @ApiProperty({
    type: [FriendRequestView],
    description: 'People asking you, newest first.',
  })
  incoming: FriendRequestView[];

  @ApiProperty({
    type: [FriendRequestView],
    description: 'People you asked, newest first.',
  })
  outgoing: FriendRequestView[];
}
