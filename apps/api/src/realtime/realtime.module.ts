import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module.js';
import { RealtimeGateway } from './realtime.gateway.js';
import { RealtimeService } from './realtime.service.js';

/**
 * Socket.IO broadcast gateway (AD-1). Imports AuthModule only to authenticate the handshake;
 * it never imports a domain module.
 */
@Module({
  imports: [AuthModule],
  providers: [RealtimeService, RealtimeGateway],
  exports: [RealtimeService],
})
export class RealtimeModule {}
