import { Injectable } from '@nestjs/common';
import { Prisma, User } from '../generated/prisma/client.js';
import { Errors } from '../common/errors/app-error.js';
import { FriendsRepository } from './friends.repository.js';
import { UpdateProfileDto } from './users.dto.js';
import { UsersRepository } from './users.repository.js';
import {
  FRIENDS_KEYS,
  MUSIC_KEYS,
  PRIVATE_KEYS,
  ProfileView,
  PUBLIC_KEYS,
  UserSummary,
} from './user.view.js';

export const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Applies a section edit onto the stored JSON: only the given keys change; '' or [] removes a key.
 * Unknown keys already stored are dropped, so a section only ever holds its own fields.
 */
function mergeSection(
  stored: unknown,
  keys: readonly string[],
  edit: object | undefined,
): Prisma.InputJsonObject | undefined {
  if (!edit) return undefined;
  const source =
    stored && typeof stored === 'object' && !Array.isArray(stored)
      ? (stored as Record<string, unknown>)
      : {};
  const changes = edit as Record<string, unknown>;
  const out: Record<string, Prisma.InputJsonValue> = {};
  for (const key of keys) {
    const value = changes[key] !== undefined ? changes[key] : source[key];
    const empty = value === '' || (Array.isArray(value) && value.length === 0);
    if (value === undefined || value === null || empty) continue;
    out[key] = value as Prisma.InputJsonValue;
  }
  return out;
}

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

@Injectable()
export class UsersService {
  constructor(
    private readonly users: UsersRepository,
    private readonly friends: FriendsRepository,
  ) {}

  findById(id: string): Promise<User | null> {
    return this.users.findById(id);
  }

  findByEmail(email: string): Promise<User | null> {
    return this.users.findByEmail(normalizeEmail(email));
  }

  findByGoogleSub(sub: string): Promise<User | null> {
    return this.users.findByGoogleSub(sub);
  }

  async createWithPassword(input: {
    email: string;
    displayName: string;
    passwordHash: string;
  }): Promise<User> {
    try {
      return await this.users.create({
        email: normalizeEmail(input.email),
        displayName: input.displayName.trim(),
        passwordHash: input.passwordHash,
      });
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        throw Errors.emailTaken();
      }
      throw error;
    }
  }

  async createFromGoogle(input: {
    email: string;
    displayName: string;
    googleSub: string;
  }): Promise<User> {
    try {
      return await this.users.create({
        email: normalizeEmail(input.email),
        displayName: input.displayName.trim().slice(0, 40) || 'Music lover',
        googleSub: input.googleSub,
        emailVerifiedAt: new Date(),
      });
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        throw Errors.accountExists();
      }
      throw error;
    }
  }

  /** FR-11 invite search: display-name prefix or exact email, ≤ 20, never the caller; friends first. */
  async search(q: string, viewerId: string): Promise<UserSummary[]> {
    const text = q.trim();
    const email = normalizeEmail(text);
    const limit = 20;
    const friendIds = await this.friends.friendIds(viewerId);
    const friends = friendIds.length
      ? await this.users.search(text, email, viewerId, limit, { in: friendIds })
      : [];
    const others =
      friends.length < limit
        ? await this.users.search(
            text,
            email,
            viewerId,
            limit - friends.length,
            {
              notIn: friendIds,
            },
          )
        : [];
    return [
      ...friends.map((u) => ({
        id: u.id,
        displayName: u.displayName,
        isFriend: true,
      })),
      ...others.map((u) => ({
        id: u.id,
        displayName: u.displayName,
        isFriend: false,
      })),
    ];
  }

  // --- Profile (FR-6, FR-7, AD-7) ----------------------------------------------------------------

  async myProfile(userId: string): Promise<ProfileView> {
    const user = await this.users.findById(userId);
    if (!user) throw Errors.unauthorized();
    return ProfileView.for(userId, user);
  }

  /** Another user's profile (or yours), cut down to what the viewer may see. */
  async profileOf(viewerId: string, targetId: string): Promise<ProfileView> {
    if (!UUID.test(targetId)) throw Errors.userNotFound();
    const target = await this.users.findById(targetId);
    if (!target) throw Errors.userNotFound();
    return ProfileView.for(
      viewerId,
      target,
      await this.friends.relation(viewerId, targetId),
    );
  }

  async updateProfile(
    userId: string,
    dto: UpdateProfileDto,
  ): Promise<ProfileView> {
    const user = await this.users.findById(userId);
    if (!user) throw Errors.unauthorized();
    const data: Prisma.UserUpdateInput = {};
    if (dto.displayName !== undefined) data.displayName = dto.displayName;
    const publicInfo = mergeSection(user.publicInfo, PUBLIC_KEYS, dto.public);
    const friendsInfo = mergeSection(
      user.friendsInfo,
      FRIENDS_KEYS,
      dto.friends,
    );
    const privateInfo = mergeSection(
      user.privateInfo,
      PRIVATE_KEYS,
      dto.private,
    );
    const musicPrefs = mergeSection(
      user.musicPrefs,
      MUSIC_KEYS,
      dto.musicPrefs,
    );
    if (publicInfo) data.publicInfo = publicInfo;
    if (friendsInfo) data.friendsInfo = friendsInfo;
    if (privateInfo) data.privateInfo = privateInfo;
    if (musicPrefs) data.musicPrefs = musicPrefs;
    const updated = Object.keys(data).length
      ? await this.users.update(userId, data)
      : user;
    return ProfileView.for(userId, updated);
  }

  /** FR-3: link a (server-verified) Google account to this user. Link-only: never re-links or unlinks. */
  async linkGoogle(userId: string, googleSub: string): Promise<User> {
    const user = await this.users.findById(userId);
    if (!user) throw Errors.unauthorized();
    if (user.googleSub === googleSub) return user;
    if (await this.users.findByGoogleSub(googleSub))
      throw Errors.googleAlreadyLinked();
    if (user.googleSub)
      throw Errors.googleAlreadyLinked(
        'Your account is already linked to another Google account.',
      );
    let linked = false;
    try {
      linked = await this.users.linkGoogleSub(userId, googleSub);
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        throw Errors.googleAlreadyLinked();
      }
      throw error;
    }
    const after = await this.users.findById(userId);
    if (!after) throw Errors.unauthorized();
    // Lost a race against another link of this same account.
    if (!linked && after.googleSub !== googleSub)
      throw Errors.googleAlreadyLinked(
        'Your account is already linked to another Google account.',
      );
    return after;
  }

  /** `{id, displayName}` of the given users (unknown ids are skipped), sorted by name. */
  refs(ids: string[]): Promise<{ id: string; displayName: string }[]> {
    if (ids.length === 0) return Promise.resolve([]);
    return this.users.refs(ids);
  }

  markEmailVerified(id: string): Promise<User> {
    return this.users.update(id, { emailVerifiedAt: new Date() });
  }

  setPasswordHash(
    id: string,
    passwordHash: string,
    verifyEmail: boolean,
  ): Promise<User> {
    return this.users.update(id, {
      passwordHash,
      ...(verifyEmail ? { emailVerifiedAt: new Date() } : {}),
    });
  }
}
