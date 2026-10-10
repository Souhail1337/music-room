import { io, type Socket } from 'socket.io-client';
import { api } from './client';

export type RealtimeStatus = 'idle' | 'connecting' | 'connected' | 'disconnected';

interface RoomHandlers {
  /** Called for every server event received for this room. */
  onEvent(event: string, payload: unknown): void;
  /** Called after each (re)connect once the room is joined again: refetch over REST (AD-1). */
  onResync(): void;
  /** The server refused or removed us from the room (private event, invite removed). */
  onRefused(): void;
}

const ROOM_EVENTS = ['queue.updated', 'presence.updated'] as const;

/**
 * The app's only Socket.IO client, built from the stored serverUrl (AD-11). It only listens:
 * every mutation is a REST call (AD-1). Rooms are ref-counted and re-joined after a reconnect.
 */
class RealtimeClient {
  private socket: Socket | null = null;
  private status: RealtimeStatus = 'idle';
  private readonly listeners = new Set<() => void>();
  private readonly rooms = new Map<string, Set<RoomHandlers>>();
  private retryTimer: ReturnType<typeof setTimeout> | null = null;

  getStatus = (): RealtimeStatus => this.status;

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  /** Joins `room` while the returned function hasn't been called. */
  join(room: string, handlers: RoomHandlers): () => void {
    let set = this.rooms.get(room);
    const first = !set;
    if (!set) {
      set = new Set();
      this.rooms.set(room, set);
    }
    set.add(handlers);
    const socket = this.ensureSocket();
    if (first && socket.connected) this.emitJoin(room);
    return () => {
      const current = this.rooms.get(room);
      current?.delete(handlers);
      if (current && current.size === 0) {
        this.rooms.delete(room);
        if (this.socket?.connected) this.socket.emit('leave', { room });
      }
    };
  }

  /** Logout / server URL change: drop the connection and every room. */
  reset(): void {
    if (this.retryTimer) clearTimeout(this.retryTimer);
    this.retryTimer = null;
    this.socket?.removeAllListeners();
    this.socket?.disconnect();
    this.socket = null;
    this.rooms.clear();
    this.setStatus('idle');
  }

  private ensureSocket(): Socket {
    if (this.socket) return this.socket;
    const socket = io(api.serverUrl, {
      transports: ['websocket'],
      // Read on every (re)connect, so a refreshed token is picked up.
      auth: (cb) => cb({ token: api.accessToken ?? '' }),
      reconnectionDelay: 500,
      reconnectionDelayMax: 5000,
    });
    this.socket = socket;
    this.setStatus('connecting');

    socket.on('connect', () => {
      this.setStatus('connected');
      for (const room of this.rooms.keys()) this.emitJoin(room);
    });
    socket.on('disconnect', () => this.setStatus('disconnected'));
    socket.on('connect_error', (error: Error) => {
      this.setStatus('disconnected');
      // Refused by the handshake middleware: Socket.IO won't retry by itself.
      if (!socket.active) void this.retryAfterAuthError(socket, error.message);
    });
    for (const event of ROOM_EVENTS) {
      socket.on(event, (payload: { room?: string; event?: { id?: string } }) => {
        const room = payload?.room ?? (payload?.event?.id ? `event:${payload.event.id}` : null);
        if (!room) return;
        this.rooms.get(room)?.forEach((h) => h.onEvent(event, payload));
      });
    }
    socket.on('room.left', (payload: { room?: string }) => {
      if (payload?.room) this.rooms.get(payload.room)?.forEach((h) => h.onRefused());
    });
    return socket;
  }

  private emitJoin(room: string): void {
    this.socket
      ?.timeout(5000)
      .emitWithAck('join', { room })
      .then((ack: { ok: boolean }) => {
        const handlers = this.rooms.get(room);
        if (!handlers) return;
        if (ack?.ok) handlers.forEach((h) => h.onResync());
        else handlers.forEach((h) => h.onRefused());
      })
      .catch(() => undefined);
  }

  private async retryAfterAuthError(socket: Socket, code: string): Promise<void> {
    if (code === 'TOKEN_EXPIRED' || code === 'UNAUTHORIZED') await api.refreshSession();
    if (this.socket !== socket || !api.hasSession) return;
    if (this.retryTimer) clearTimeout(this.retryTimer);
    this.retryTimer = setTimeout(() => {
      this.retryTimer = null;
      if (this.socket === socket && !socket.connected) socket.connect();
    }, 2000);
  }

  private setStatus(status: RealtimeStatus): void {
    if (this.status === status) return;
    this.status = status;
    this.listeners.forEach((l) => l());
  }
}

export const realtime = new RealtimeClient();
