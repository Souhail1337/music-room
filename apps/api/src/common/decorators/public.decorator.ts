import { SetMetadata } from '@nestjs/common';

export const IS_PUBLIC_KEY = 'isPublic';
/** Opts a route out of the global JwtAuthGuard. */
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);

export const SKIP_EMAIL_VERIFIED_KEY = 'skipEmailVerified';
/** Opts a route or controller out of the global EmailVerifiedGuard (only `/auth/*` and `/health`). */
export const SkipEmailVerified = () =>
  SetMetadata(SKIP_EMAIL_VERIFIED_KEY, true);

export const AUTH_THROTTLE_KEY = 'authThrottle';
/** Applies the strict per IP+account limit (5/min) on top of the global one. */
export const AuthThrottle = () => SetMetadata(AUTH_THROTTLE_KEY, true);
