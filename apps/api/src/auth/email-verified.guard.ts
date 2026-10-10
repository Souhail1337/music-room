import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AuthUser } from '../common/decorators/current-user.decorator.js';
import {
  IS_PUBLIC_KEY,
  SKIP_EMAIL_VERIFIED_KEY,
} from '../common/decorators/public.decorator.js';
import { Errors } from '../common/errors/app-error.js';

/** Global: an unverified user can only reach `/auth/*` and `/health` (FR-1, AD-6). */
@Injectable()
export class EmailVerifiedGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const targets = [context.getHandler(), context.getClass()];
    if (this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, targets))
      return true;
    if (
      this.reflector.getAllAndOverride<boolean>(
        SKIP_EMAIL_VERIFIED_KEY,
        targets,
      )
    )
      return true;
    const user = context.switchToHttp().getRequest<{ user?: AuthUser }>().user;
    if (user && !user.emailVerified) throw Errors.emailNotVerified();
    return true;
  }
}
