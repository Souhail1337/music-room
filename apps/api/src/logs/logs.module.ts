import { Module } from '@nestjs/common';
import { ActionLogInterceptor } from './action-log.interceptor.js';
import { ActionLogService } from './action-log.service.js';

@Module({
  providers: [ActionLogService, ActionLogInterceptor],
  exports: [ActionLogService, ActionLogInterceptor],
})
export class LogsModule {}
