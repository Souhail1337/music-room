import { Injectable } from '@nestjs/common';
import { Errors } from '../common/errors/app-error.js';
import { FriendsRepository, RequestRow } from './friends.repository.js';
import { UsersRepository } from './users.repository.js';
import { UUID } from './users.service.js';
import {
  FriendList,
  FriendRequests,
  FriendRequestView,
  ProfileView,
} from './user.view.js';

const requestView = (r: RequestRow): FriendRequestView => ({
  id: r.id,
  user: { id: r.user.id, displayName: r.user.displayName },
  createdAt: r.createdAt.toISOString(),
});

/**
 * Mutual friendships with requests (FR-8). A request crossing a pending one in the other direction
 * accepts both; declining or cancelling deletes the request; removing deletes the friendship.
 */
@Injectable()
export class FriendsService {
  constructor(
    private readonly friends: FriendsRepository,
    private readonly users: UsersRepository,
  ) {}

  async list(userId: string): Promise<FriendList> {
    const rows = await this.friends.friends(userId);
    return {
      items: rows.map((f) => ({
        id: f.id,
        displayName: f.displayName,
        since: f.since.toISOString(),
      })),
    };
  }

  async requests(userId: string): Promise<FriendRequests> {
    const { incoming, outgoing } = await this.friends.requests(userId);
    return {
      incoming: incoming.map(requestView),
      outgoing: outgoing.map(requestView),
    };
  }

  /** Sends (or, if they already asked you, accepts) a request. Sending the same request twice is a no-op. */
  async request(userId: string, targetId: string): Promise<ProfileView> {
    if (targetId === userId)
      throw Errors.validation({
        fields: { userId: ["You can't add yourself as a friend."] },
      });
    if (!UUID.test(targetId)) throw Errors.userNotFound();
    if (!(await this.users.findById(targetId))) throw Errors.userNotFound();

    await this.friends.withPairLock(userId, targetId, async (tx) => {
      if (await this.friends.areFriends(userId, targetId, tx))
        throw Errors.alreadyFriends();
      if (await this.friends.findRequestBetween(tx, targetId, userId)) {
        await this.friends.befriend(tx, userId, targetId);
        return;
      }
      if (!(await this.friends.findRequestBetween(tx, userId, targetId)))
        await this.friends.createRequest(tx, userId, targetId);
    });
    return this.profile(userId, targetId);
  }

  /** The addressee accepts: both become friends. Returns the requester's profile (now with Friends info). */
  async accept(userId: string, requestId: string): Promise<ProfileView> {
    if (!UUID.test(requestId)) throw Errors.friendRequestNotFound();
    const request = await this.friends.findRequest(requestId);
    if (!request || request.addresseeId !== userId)
      throw Errors.friendRequestNotFound();
    await this.friends.withPairLock(request.requesterId, userId, async (tx) => {
      // Re-read under the lock: it may have been cancelled meanwhile.
      if (!(await this.friends.findRequest(requestId, tx)))
        throw Errors.friendRequestNotFound();
      await this.friends.befriend(tx, request.requesterId, userId);
    });
    return this.profile(userId, request.requesterId);
  }

  /** The addressee declines: the request is deleted. */
  decline(userId: string, requestId: string): Promise<void> {
    return this.withdraw(requestId, 'addresseeId', userId);
  }

  /** The requester cancels: the request is deleted. */
  cancel(userId: string, requestId: string): Promise<void> {
    return this.withdraw(requestId, 'requesterId', userId);
  }

  /**
   * Deletes a request on behalf of one of its parties, under the same pair lock as accept: a
   * concurrent accept and cancel/decline can't both succeed.
   */
  private async withdraw(
    requestId: string,
    party: 'requesterId' | 'addresseeId',
    userId: string,
  ): Promise<void> {
    if (!UUID.test(requestId)) throw Errors.friendRequestNotFound();
    const request = await this.friends.findRequest(requestId);
    if (!request || request[party] !== userId)
      throw Errors.friendRequestNotFound();
    await this.friends.withPairLock(
      request.requesterId,
      request.addresseeId,
      async (tx) => {
        if (
          !(await this.friends.deleteRequest(tx, requestId, {
            [party]: userId,
          }))
        )
          throw Errors.friendRequestNotFound();
      },
    );
  }

  /** Either friend ends the friendship. */
  async remove(userId: string, friendId: string): Promise<void> {
    if (
      !UUID.test(friendId) ||
      friendId === userId ||
      !(await this.friends.unfriend(userId, friendId))
    )
      throw Errors.notFriends();
  }

  private async profile(
    viewerId: string,
    targetId: string,
  ): Promise<ProfileView> {
    const target = await this.users.findById(targetId);
    if (!target) throw Errors.userNotFound();
    return ProfileView.for(
      viewerId,
      target,
      await this.friends.relation(viewerId, targetId),
    );
  }
}
