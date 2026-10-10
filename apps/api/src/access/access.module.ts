import { Module } from '@nestjs/common';
import { AccessService } from './access.service.js';

/** The shared access policy (AD-4). REST services and the realtime room authorizer use it. */
@Module({ providers: [AccessService], exports: [AccessService] })
export class AccessModule {}
