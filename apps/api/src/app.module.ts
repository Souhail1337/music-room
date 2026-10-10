import { MiddlewareConsumer, Module, NestModule } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_FILTER, APP_GUARD, APP_PIPE } from '@nestjs/core';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { AccessModule } from './access/access.module.js';
import { AuthModule } from './auth/auth.module.js';
import { EmailVerifiedGuard } from './auth/email-verified.guard.js';
import { JwtAuthGuard } from './auth/jwt-auth.guard.js';
import { CommonModule } from './common/common.module.js';
import { validateEnv } from './common/config/env.validation.js';
import { AllExceptionsFilter } from './common/errors/all-exceptions.filter.js';
import { throttlerOptions } from './common/guards/throttler.config.js';
import { PrismaModule } from './common/prisma/prisma.module.js';
import { createValidationPipe } from './common/validation.js';
import { EventsModule } from './events/events.module.js';
import { ActionLogInterceptor } from './logs/action-log.interceptor.js';
import { LogsModule } from './logs/logs.module.js';
import { MusicModule } from './music/music.module.js';
import { PlaylistsModule } from './playlists/playlists.module.js';
import { RealtimeModule } from './realtime/realtime.module.js';
import { UsersModule } from './users/users.module.js';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: ['.env', '../../.env'],
      validate: validateEnv,
    }),
    ThrottlerModule.forRoot(throttlerOptions()),
    PrismaModule,
    CommonModule,
    LogsModule,
    UsersModule,
    AuthModule,
    RealtimeModule,
    MusicModule,
    AccessModule,
    EventsModule,
    PlaylistsModule,
  ],
  providers: [
    { provide: APP_PIPE, useFactory: createValidationPipe },
    { provide: APP_FILTER, useClass: AllExceptionsFilter },
    // Guard order matters: rate limit → authenticate → require a verified email.
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    { provide: APP_GUARD, useExisting: JwtAuthGuard },
    { provide: APP_GUARD, useExisting: EmailVerifiedGuard },
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer.apply(ActionLogInterceptor).forRoutes('{*path}');
  }
}
