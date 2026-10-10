import { Logger } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { SkipThrottle } from '@nestjs/throttler';
import {
  ConnectedSocket,
  MessageBody,
  OnGatewayConnection,
  OnGatewayInit,
  SubscribeMessage,
  WebSocketGateway,
} from '@nestjs/websockets';
import type { Server, Socket } from 'socket.io';
import { SessionsService } from '../auth/sessions.service.js';
import { Public } from '../common/decorators/public.decorator.js';
import { RealtimeService, SocketData } from './realtime.service.js';

interface RoomMessage {
  room?: unknown;
}

export type JoinAck =
  | { ok: true; room: string; listeners: number }
  | { ok: false; code: 'NOT_FOUND' | 'BAD_REQUEST' };

function handshakeToken(socket: Socket): string | null {
  const auth = socket.handshake.auth as { token?: unknown } | undefined;
  if (typeof auth?.token === 'string' && auth.token) return auth.token;
  const header = socket.handshake.headers.authorization ?? '';
  const [scheme, token] = header.split(' ');
  return scheme === 'Bearer' && token ? token : null;
}

function connectError(code: string): Error & { data: { code: string } } {
  return Object.assign(new Error(code), { data: { code } });
}

/**
 * Socket.IO gateway (AD-1): clients authenticate with their access token, then `join` / `leave`
 * rooms. It never accepts mutations. HTTP guards don't apply here: the handshake middleware
 * authenticates instead, and `join` asks the domain's authorizer (canView, AD-4).
 */
@Public()
@SkipThrottle({ default: true, auth: true })
@WebSocketGateway({ cors: { origin: '*' } })
export class RealtimeGateway implements OnGatewayInit, OnGatewayConnection {
  private readonly logger = new Logger(RealtimeGateway.name);

  constructor(
    private readonly realtime: RealtimeService,
    private readonly jwt: JwtService,
    private readonly sessions: SessionsService,
  ) {}

  afterInit(server: Server): void {
    this.realtime.attach(server);
    server.use((socket, next) => {
      this.authenticate(socket).then(
        () => next(),
        (error: Error) => next(error),
      );
    });
  }

  handleConnection(socket: Socket): void {
    // Rooms are already empty in 'disconnect': capture them first to update their listener count.
    socket.on('disconnecting', () => {
      const rooms = [...socket.rooms].filter((room) => room !== socket.id);
      setImmediate(() =>
        rooms.forEach((room) => void this.realtime.presence(room)),
      );
    });
  }

  @SubscribeMessage('join')
  async join(
    @ConnectedSocket() socket: Socket,
    @MessageBody() body: RoomMessage,
  ): Promise<JoinAck> {
    try {
      const room = typeof body?.room === 'string' ? body.room : null;
      if (!room) return { ok: false, code: 'BAD_REQUEST' };
      const { userId } = socket.data as SocketData;
      if (!(await this.realtime.canJoin(userId, room)))
        return { ok: false, code: 'NOT_FOUND' };
      await socket.join(room);
      void this.realtime.presence(room);
      return { ok: true, room, listeners: this.realtime.listenerCount(room) };
    } catch (error) {
      this.logger.warn(`join failed: ${String(error)}`);
      return { ok: false, code: 'BAD_REQUEST' };
    }
  }

  @SubscribeMessage('leave')
  async leave(
    @ConnectedSocket() socket: Socket,
    @MessageBody() body: RoomMessage,
  ): Promise<{ ok: boolean }> {
    const room = typeof body?.room === 'string' ? body.room : null;
    if (!room || !socket.rooms.has(room) || room === socket.id)
      return { ok: false };
    await socket.leave(room);
    void this.realtime.presence(room);
    return { ok: true };
  }

  /** Same checks as JwtAuthGuard + EmailVerifiedGuard: valid token, live session, verified email. */
  private async authenticate(socket: Socket): Promise<void> {
    const token = handshakeToken(socket);
    if (!token) throw connectError('UNAUTHORIZED');
    let payload: { sub?: unknown; sid?: unknown };
    try {
      payload = await this.jwt.verifyAsync(token);
    } catch (error) {
      throw connectError(
        (error as Error).name === 'TokenExpiredError'
          ? 'TOKEN_EXPIRED'
          : 'UNAUTHORIZED',
      );
    }
    if (typeof payload.sub !== 'string' || typeof payload.sid !== 'string')
      throw connectError('UNAUTHORIZED');
    const principal = await this.sessions.principal(payload.sid, payload.sub);
    if (!principal) throw connectError('SESSION_REVOKED');
    if (!principal.emailVerified) throw connectError('EMAIL_NOT_VERIFIED');
    (socket.data as SocketData).userId = principal.userId;
  }
}
