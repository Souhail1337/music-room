import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { ThrottlerException } from '@nestjs/throttler';
import type { Response } from 'express';
import { AppError, ErrorBody, Errors } from './app-error.js';

const STATUS_CODES: Record<number, string> = {
  400: 'BAD_REQUEST',
  401: 'UNAUTHORIZED',
  403: 'FORBIDDEN',
  404: 'NOT_FOUND',
  405: 'METHOD_NOT_ALLOWED',
  409: 'CONFLICT',
  413: 'PAYLOAD_TOO_LARGE',
  415: 'UNSUPPORTED_MEDIA_TYPE',
  429: 'RATE_LIMITED',
  503: 'SERVICE_UNAVAILABLE',
};

/** Turns every error into `{ code: UPPER_SNAKE, message, details? }` (AD-11). */
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger('Exceptions');

  catch(exception: unknown, host: ArgumentsHost): void {
    const res = host.switchToHttp().getResponse<Response>();
    const { status, body } = this.toBody(exception);
    if (status >= 500 && !(exception instanceof AppError)) {
      this.logger.error(
        exception instanceof Error ? exception.stack : String(exception),
      );
    }
    if (res.headersSent) return;
    res.status(status).json(body);
  }

  private toBody(exception: unknown): { status: number; body: ErrorBody } {
    if (exception instanceof ThrottlerException) {
      const e = Errors.rateLimited();
      return { status: e.getStatus(), body: e.getResponse() as ErrorBody };
    }
    if (exception instanceof AppError) {
      return {
        status: exception.getStatus(),
        body: exception.getResponse() as ErrorBody,
      };
    }
    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      const response = exception.getResponse();
      const message =
        typeof response === 'string'
          ? response
          : typeof (response as { message?: unknown }).message === 'string'
            ? (response as { message: string }).message
            : exception.message;
      return {
        status,
        body: { code: STATUS_CODES[status] ?? `HTTP_${status}`, message },
      };
    }
    // body-parser errors (malformed JSON, too large) carry a numeric status.
    const status = (exception as { status?: unknown })?.status;
    if (typeof status === 'number' && status >= 400 && status < 500) {
      return {
        status,
        body: {
          code: STATUS_CODES[status] ?? 'BAD_REQUEST',
          message: 'The request could not be read.',
        },
      };
    }
    return {
      status: HttpStatus.INTERNAL_SERVER_ERROR,
      body: {
        code: 'INTERNAL_ERROR',
        message: 'Something went wrong on the server.',
      },
    };
  }
}
