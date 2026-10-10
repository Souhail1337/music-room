import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtService, TokenExpiredError } from '@nestjs/jwt';
import type { Request } from 'express';
import { AuthUser } from '../common/decorators/current-user.decorator.js';
import { IS_PUBLIC_KEY } from '../common/decorators/public.decorator.js';
import { Errors } from '../common/errors/app-error.js';
import { SessionsService } from './sessions.service.js';

/** Global: every route needs a valid access token whose session is still live, unless marked @Public(). */
@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly jwt: JwtService,
    private readonly sessions: SessionsService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;

    const req = context
      .switchToHttp()
      .getRequest<Request & { user?: AuthUser }>();
    const [scheme, token] = (req.headers.authorization ?? '').split(' ');
    if (scheme !== 'Bearer' || !token) throw Errors.unauthorized();

    let payload: { sub?: unknown; sid?: unknown };
    try {
      payload = await this.jwt.verifyAsync(token);
    } catch (error) {
      throw error instanceof TokenExpiredError
        ? Errors.tokenExpired()
        : Errors.unauthorized();
    }
    if (typeof payload.sub !== 'string' || typeof payload.sid !== 'string')
      throw Errors.unauthorized();

    const principal = await this.sessions.principal(payload.sid, payload.sub);
    if (!principal) throw Errors.sessionRevoked();
    req.user = {
      id: principal.userId,
      sessionId: principal.sessionId,
      emailVerified: principal.emailVerified,
    };
    return true;
  }
}
