import { ExecutionContext } from '@nestjs/common';
import { ThrottlerModuleOptions, seconds } from '@nestjs/throttler';
import { createHash } from 'node:crypto';
import { AUTH_THROTTLE_KEY } from '../decorators/public.decorator.js';
import { intEnv } from '../config/env.validation.js';

/** Identifies "the account" an auth request targets: email, link token or bearer token. */
function accountKey(req: Record<string, any>): string {
  const email =
    typeof req.body?.email === 'string'
      ? req.body.email.trim().toLowerCase()
      : '';
  const token = typeof req.query?.token === 'string' ? req.query.token : '';
  const bearer =
    typeof req.headers?.authorization === 'string'
      ? req.headers.authorization
      : '';
  const raw = email || token || bearer;
  return raw
    ? createHash('sha256').update(raw).digest('hex').slice(0, 24)
    : '-';
}

/**
 * Global: 100 req/min per IP. Routes marked @AuthThrottle(): additionally 5 req/min per IP+account
 * (spine conventions, NFR-5). Limits are read from env so tests can raise the global one.
 */
export function throttlerOptions(
  env: NodeJS.ProcessEnv = process.env,
): ThrottlerModuleOptions {
  return {
    throttlers: [
      {
        name: 'default',
        ttl: seconds(60),
        limit: intEnv(env.THROTTLE_LIMIT, 100),
      },
      {
        name: 'auth',
        ttl: seconds(60),
        limit: intEnv(env.AUTH_THROTTLE_LIMIT, 5),
        skipIf: (ctx: ExecutionContext) =>
          !Reflect.getMetadata(AUTH_THROTTLE_KEY, ctx.getHandler()) &&
          !Reflect.getMetadata(AUTH_THROTTLE_KEY, ctx.getClass()),
        getTracker: (req) => `${String(req.ip)}|${accountKey(req)}`,
      },
    ],
  };
}
