import { ValidationError, ValidationPipe } from '@nestjs/common';
import { Errors } from './errors/app-error.js';

function flatten(
  errors: ValidationError[],
  parent = '',
): Record<string, string[]> {
  const out: Record<string, string[]> = {};
  for (const error of errors) {
    const path = parent ? `${parent}.${error.property}` : error.property;
    if (error.constraints) out[path] = Object.values(error.constraints);
    if (error.children?.length)
      Object.assign(out, flatten(error.children, path));
  }
  return out;
}

/** Global pipe: whitelist + forbid unknown fields; failures become 400 VALIDATION_FAILED with per-field details. */
export function createValidationPipe(): ValidationPipe {
  return new ValidationPipe({
    whitelist: true,
    forbidNonWhitelisted: true,
    transform: true,
    exceptionFactory: (errors) =>
      Errors.validation({ fields: flatten(errors) }),
  });
}
