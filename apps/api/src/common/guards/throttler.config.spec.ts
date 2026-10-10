import { ExecutionContext } from '@nestjs/common';
import { throttlerOptions } from './throttler.config.js';
import { AUTH_THROTTLE_KEY } from '../decorators/public.decorator.js';

class Ctl {}
const login = () => undefined;
const other = () => undefined;
Reflect.defineMetadata(AUTH_THROTTLE_KEY, true, login);

const ctx = (handler: () => void) =>
  ({
    getHandler: () => handler,
    getClass: () => Ctl,
  }) as unknown as ExecutionContext;

describe('throttlerOptions', () => {
  const opts = throttlerOptions({
    THROTTLE_LIMIT: '100',
    AUTH_THROTTLE_LIMIT: '5',
  } as NodeJS.ProcessEnv);
  const [global, auth] = Array.isArray(opts) ? opts : opts.throttlers;

  it('limits everything to 100/min and auth routes to 5/min', () => {
    expect(global).toMatchObject({ name: 'default', limit: 100, ttl: 60_000 });
    expect(auth).toMatchObject({ name: 'auth', limit: 5, ttl: 60_000 });
  });

  it('applies the auth limit only to @AuthThrottle() routes', () => {
    expect(auth.skipIf!(ctx(login))).toBe(false);
    expect(auth.skipIf!(ctx(other))).toBe(true);
  });

  it('tracks auth requests per IP + account (case-insensitive email)', async () => {
    const track = (ip: string, email: string) =>
      auth.getTracker!(
        { ip, body: { email }, query: {}, headers: {} },
        ctx(login),
      );
    expect(await track('1.1.1.1', 'A@x.io')).toBe(
      await track('1.1.1.1', 'a@x.io'),
    );
    expect(await track('1.1.1.1', 'a@x.io')).not.toBe(
      await track('1.1.1.1', 'b@x.io'),
    );
    expect(await track('1.1.1.1', 'a@x.io')).not.toBe(
      await track('2.2.2.2', 'a@x.io'),
    );
  });
});
