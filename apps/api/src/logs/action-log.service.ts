import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../common/prisma/prisma.service.js';
import type { Prisma } from '../generated/prisma/client.js';

/** Owns the ActionLog table. Only the global request logger writes to it (AD-10). */
@Injectable()
export class ActionLogService {
  private readonly logger = new Logger(ActionLogService.name);
  private pending = new Set<Promise<unknown>>();

  constructor(private readonly prisma: PrismaService) {}

  record(entry: Prisma.ActionLogUncheckedCreateInput): void {
    const write = this.prisma.actionLog
      .create({ data: entry })
      .catch((error: Error) =>
        this.logger.warn(`ActionLog write failed: ${error.message}`),
      )
      .finally(() => this.pending.delete(write));
    this.pending.add(write);
  }

  /** Waits for in-flight writes (graceful shutdown, tests). */
  async flush(): Promise<void> {
    await Promise.all(this.pending);
  }
}
