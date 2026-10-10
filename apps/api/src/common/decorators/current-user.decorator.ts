import { createParamDecorator, ExecutionContext } from '@nestjs/common';

/** What JwtAuthGuard attaches to `req.user`. */
export interface AuthUser {
  id: string;
  sessionId: string;
  emailVerified: boolean;
}

export const CurrentUser = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): AuthUser =>
    ctx.switchToHttp().getRequest<{ user: AuthUser }>().user,
);
