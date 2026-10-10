import { HttpException, HttpStatus } from '@nestjs/common';

/** The one error shape the API returns (AD-11). */
export interface ErrorBody {
  code: string;
  message: string;
  details?: unknown;
}

/** Throw this from anywhere: the global filter turns it into `{ code, message, details? }`. */
export class AppError extends HttpException {
  constructor(
    readonly code: string,
    message: string,
    status: HttpStatus,
    readonly details?: unknown,
  ) {
    super({ code, message, details } satisfies ErrorBody, status);
  }
}

export const Errors = {
  validation: (details: unknown) =>
    new AppError(
      'VALIDATION_FAILED',
      'Some fields are invalid.',
      HttpStatus.BAD_REQUEST,
      details,
    ),
  emailTaken: () =>
    new AppError(
      'EMAIL_TAKEN',
      'An account with this email already exists.',
      HttpStatus.CONFLICT,
    ),
  accountExists: () =>
    new AppError(
      'ACCOUNT_EXISTS',
      'An account with this email already exists. Log in with your password.',
      HttpStatus.CONFLICT,
    ),
  invalidCredentials: () =>
    new AppError(
      'INVALID_CREDENTIALS',
      'Wrong email or password.',
      HttpStatus.UNAUTHORIZED,
    ),
  unauthorized: () =>
    new AppError(
      'UNAUTHORIZED',
      'You need to log in.',
      HttpStatus.UNAUTHORIZED,
    ),
  tokenExpired: () =>
    new AppError(
      'TOKEN_EXPIRED',
      'Your session token expired.',
      HttpStatus.UNAUTHORIZED,
    ),
  sessionRevoked: () =>
    new AppError(
      'SESSION_REVOKED',
      'Your session has ended. Log in again.',
      HttpStatus.UNAUTHORIZED,
    ),
  sessionExpired: () =>
    new AppError(
      'SESSION_EXPIRED',
      'Your session has expired. Log in again.',
      HttpStatus.UNAUTHORIZED,
    ),
  emailNotVerified: () =>
    new AppError(
      'EMAIL_NOT_VERIFIED',
      'Check your email to finish signing up.',
      HttpStatus.FORBIDDEN,
    ),
  googleNotConfigured: () =>
    new AppError(
      'GOOGLE_NOT_CONFIGURED',
      "Google sign-in isn't configured.",
      HttpStatus.SERVICE_UNAVAILABLE,
    ),
  googleTokenInvalid: () =>
    new AppError(
      'GOOGLE_TOKEN_INVALID',
      "Couldn't verify your Google account.",
      HttpStatus.UNAUTHORIZED,
    ),
  rateLimited: () =>
    new AppError(
      'RATE_LIMITED',
      'Too many attempts. Try again in a minute.',
      HttpStatus.TOO_MANY_REQUESTS,
    ),
};
