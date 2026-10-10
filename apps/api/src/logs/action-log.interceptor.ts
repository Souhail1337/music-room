import { Injectable, NestMiddleware } from '@nestjs/common';
import type { NextFunction, Request, Response } from 'express';
import { AuthUser } from '../common/decorators/current-user.decorator.js';
import { ActionLogService } from './action-log.service.js';

const MAX_HEADER = 200;

function header(req: Request, name: string): string | null {
  const value = req.headers[name];
  const text = Array.isArray(value) ? value[0] : value;
  return text ? text.slice(0, MAX_HEADER) : null;
}

/**
 * The global ActionLog hook (AD-10): one row per API request, with the X-Platform / X-Device /
 * X-App-Version headers. It is mounted as global middleware that writes when the response
 * finishes, so requests rejected by guards (401/403/429) or unmatched routes are logged too —
 * a Nest interceptor would never see those.
 */
@Injectable()
export class ActionLogInterceptor implements NestMiddleware {
  constructor(private readonly logs: ActionLogService) {}

  use(req: Request, res: Response, next: NextFunction): void {
    // Swagger UI assets and the container health probe are not app actions.
    // (req.path is relative to the middleware mount point here; originalUrl is the full path.)
    const path = req.originalUrl.split('?')[0];
    if (path.startsWith('/docs')) return next();
    if (path === '/health' && req.headers['x-internal-probe'] === '1') return next();
    const started = process.hrtime.bigint();
    // 'close' fires after a normal finish and also when the client aborts (e.g. the app's 10s timeout).
    res.once('close', () => {
      const user = (req as Request & { user?: AuthUser }).user;
      const routePath = (req.route as { path?: string } | undefined)?.path;
      this.logs.record({
        userId: user?.id ?? null,
        method: req.method,
        route: routePath ? `${req.baseUrl}${routePath}` : '(unmatched)',
        path: path.slice(0, 500),
        status: res.writableFinished ? res.statusCode : 499,
        platform: header(req, 'x-platform'),
        device: header(req, 'x-device'),
        appVersion: header(req, 'x-app-version'),
        ip: req.ip ?? null,
        durationMs: Number((process.hrtime.bigint() - started) / 1_000_000n),
      });
    });
    next();
  }
}
