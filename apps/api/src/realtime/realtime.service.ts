import { Injectable, Logger } from '@nestjs/common';
import type { Server, Socket } from 'socket.io';

/** Decides whether a user may join a room `<prefix>:<id>`; registered by the owning domain module. */
export type RoomAuthorizer = (userId: string, id: string) => Promise<boolean>;

/** Display names for presence; registered by the domain module so realtime never imports users. */
export type PresenceResolver = (
  userIds: string[],
) => Promise<{ id: string; displayName: string }[]>;

/** Payload of `presence.updated`. `viewers` is present for rooms whose prefix has a resolver. */
export interface PresencePayload {
  room: string;
  listeners: number;
  viewers?: { id: string; displayName: string }[];
}

export interface SocketData {
  userId: string;
}

const ROOM = /^([a-z]+):([0-9a-f-]{36})$/i;

/**
 * Broadcast-only side of the realtime layer (AD-1). Domain services call `emit` after their
 * transaction commits. It never imports a domain module: room access is delegated to authorizers
 * the domain modules register (events registers `event`, using the shared access policy).
 */
@Injectable()
export class RealtimeService {
  private readonly logger = new Logger(RealtimeService.name);
  private server: Server | null = null;
  private readonly authorizers = new Map<string, RoomAuthorizer>();
  private readonly resolvers = new Map<string, PresenceResolver>();

  attach(server: Server): void {
    this.server = server;
  }

  registerRoomAuthorizer(prefix: string, authorizer: RoomAuthorizer): void {
    this.authorizers.set(prefix, authorizer);
  }

  /** Makes `presence.updated` for `<prefix>:<id>` rooms carry the viewers' names. */
  registerPresenceResolver(prefix: string, resolver: PresenceResolver): void {
    this.resolvers.set(prefix, resolver);
  }

  /** False for malformed rooms, unknown prefixes, and anything the authorizer refuses. */
  async canJoin(userId: string, room: string): Promise<boolean> {
    const match = ROOM.exec(room);
    if (!match) return false;
    const authorizer = this.authorizers.get(match[1]);
    if (!authorizer) return false;
    try {
      return await authorizer(userId, match[2].toLowerCase());
    } catch (error) {
      this.logger.warn(`Room authorizer failed for ${room}: ${String(error)}`);
      return false;
    }
  }

  /** Broadcasts to everyone in the room. Call only after the DB transaction has committed. */
  emit(room: string, event: string, payload: unknown): void {
    this.server?.to(room).emit(event, payload);
  }

  /** Distinct users currently in the room (several devices of one user count once). */
  listenerCount(room: string): number {
    return this.userIdsIn(room).size;
  }

  /** Distinct users in the room, with names when the room's domain registered a resolver. */
  async presenceOf(room: string): Promise<PresencePayload> {
    const ids = [...this.userIdsIn(room)];
    const payload: PresencePayload = { room, listeners: ids.length };
    const prefix = ROOM.exec(room)?.[1];
    const resolver = prefix ? this.resolvers.get(prefix) : undefined;
    if (resolver) payload.viewers = await resolver(ids);
    return payload;
  }

  /** Broadcasts who is in the room now. Never throws. */
  async presence(room: string): Promise<void> {
    try {
      this.emit(room, 'presence.updated', await this.presenceOf(room));
    } catch (error) {
      this.logger.warn(`presence failed for ${room}: ${String(error)}`);
    }
  }

  /** Re-checks every socket in the room (after visibility or invite changes) and removes refused ones. */
  async reauthorize(room: string): Promise<void> {
    const removed: Socket[] = [];
    for (const socket of this.socketsIn(room)) {
      const userId = (socket.data as Partial<SocketData>).userId;
      if (!userId || !(await this.canJoin(userId, room))) {
        await socket.leave(room);
        socket.emit('room.left', { room, code: 'NOT_FOUND' });
        removed.push(socket);
      }
    }
    if (removed.length > 0) await this.presence(room);
  }

  private socketsIn(room: string): Socket[] {
    const ids = this.server?.sockets.adapter.rooms.get(room);
    if (!ids) return [];
    const sockets: Socket[] = [];
    for (const id of ids) {
      const socket = this.server?.sockets.sockets.get(id);
      if (socket) sockets.push(socket);
    }
    return sockets;
  }

  private userIdsIn(room: string): Set<string> {
    const users = new Set<string>();
    for (const socket of this.socketsIn(room)) {
      const userId = (socket.data as Partial<SocketData>).userId;
      if (userId) users.add(userId);
    }
    return users;
  }
}
