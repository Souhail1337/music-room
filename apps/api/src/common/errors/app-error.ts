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
  notFound: (message = 'Not found.') =>
    new AppError('NOT_FOUND', message, HttpStatus.NOT_FOUND),
  eventNotFound: () =>
    new AppError(
      'NOT_FOUND',
      "This event doesn't exist or is private.",
      HttpStatus.NOT_FOUND,
    ),
  suggestionNotFound: () =>
    new AppError(
      'NOT_FOUND',
      'This track is no longer in the queue.',
      HttpStatus.NOT_FOUND,
    ),
  userNotFound: () =>
    new AppError('USER_NOT_FOUND', 'No such user.', HttpStatus.NOT_FOUND),
  trackNotFound: () =>
    new AppError(
      'TRACK_NOT_FOUND',
      "This track isn't available.",
      HttpStatus.NOT_FOUND,
    ),
  previewUnavailable: () =>
    new AppError(
      'PREVIEW_UNAVAILABLE',
      'This track has no preview to play.',
      HttpStatus.NOT_FOUND,
    ),
  musicUnavailable: () =>
    new AppError(
      'MUSIC_UNAVAILABLE',
      "Music search isn't available right now. Try again in a moment.",
      HttpStatus.SERVICE_UNAVAILABLE,
    ),
  notHost: () =>
    new AppError(
      'NOT_HOST',
      'Only the host can do this.',
      HttpStatus.FORBIDDEN,
    ),
  notInvited: () =>
    new AppError(
      'NOT_INVITED',
      'Only invited people can vote in this event.',
      HttpStatus.FORBIDDEN,
    ),
  outsideArea: () =>
    new AppError(
      'OUTSIDE_AREA',
      'Only people at the venue can vote in this event.',
      HttpStatus.FORBIDDEN,
    ),
  outsideTimeWindow: (details?: unknown) =>
    new AppError(
      'OUTSIDE_TIME_WINDOW',
      'Voting is only open during the event.',
      HttpStatus.FORBIDDEN,
      details,
    ),
  locationRequired: () =>
    new AppError(
      'LOCATION_REQUIRED',
      'Allow location to vote at this event.',
      HttpStatus.BAD_REQUEST,
    ),
};
