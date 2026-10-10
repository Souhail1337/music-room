import {
  ArgumentsHost,
  BadRequestException,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { ThrottlerException } from '@nestjs/throttler';
import { AllExceptionsFilter } from './all-exceptions.filter.js';
import { Errors } from './app-error.js';

function run(exception: unknown) {
  const res = {
    headersSent: false,
    statusCode: 0,
    body: undefined as unknown,
    status(code: number) {
      this.statusCode = code;
      return this;
    },
    json(body: unknown) {
      this.body = body;
      return this;
    },
  };
  const host = {
    switchToHttp: () => ({ getResponse: () => res }),
  } as unknown as ArgumentsHost;
  new AllExceptionsFilter().catch(exception, host);
  return res;
}

describe('AllExceptionsFilter', () => {
  beforeEach(() => {
    vi.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
  });

  it('keeps AppError codes and details', () => {
    const res = run(Errors.validation({ fields: { password: ['too short'] } }));
    expect(res.statusCode).toBe(400);
    expect(res.body).toEqual({
      code: 'VALIDATION_FAILED',
      message: 'Some fields are invalid.',
      details: { fields: { password: ['too short'] } },
    });
  });

  it('maps throttling to 429 RATE_LIMITED', () => {
    const res = run(new ThrottlerException());
    expect(res.statusCode).toBe(429);
    expect(res.body).toMatchObject({ code: 'RATE_LIMITED' });
  });

  it('maps plain HttpExceptions to an UPPER_SNAKE code', () => {
    expect(run(new NotFoundException('Cannot GET /x')).body).toEqual({
      code: 'NOT_FOUND',
      message: 'Cannot GET /x',
    });
    expect(run(new BadRequestException()).body).toMatchObject({
      code: 'BAD_REQUEST',
    });
  });

  it('hides unknown errors behind 500 INTERNAL_ERROR', () => {
    const res = run(new Error('db password is hunter2'));
    expect(res.statusCode).toBe(500);
    expect(res.body).toEqual({
      code: 'INTERNAL_ERROR',
      message: 'Something went wrong on the server.',
    });
  });
});
