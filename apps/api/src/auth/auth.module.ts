import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { UsersModule } from '../users/users.module.js';
import { AuthTokensService } from './auth-tokens.service.js';
import { AuthController } from './auth.controller.js';
import { AuthService } from './auth.service.js';
import { EmailVerifiedGuard } from './email-verified.guard.js';
import { GoogleVerifierService } from './google-verifier.service.js';
import { JwtAuthGuard } from './jwt-auth.guard.js';
import { LinkGoogleController } from './link-google.controller.js';
import { MailService } from './mail.service.js';
import { SessionsService } from './sessions.service.js';

@Module({
  imports: [
    UsersModule,
    JwtModule.registerAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        secret: config.getOrThrow<string>('JWT_ACCESS_SECRET'),
        signOptions: { algorithm: 'HS256' },
        verifyOptions: { algorithms: ['HS256'] },
      }),
    }),
  ],
  controllers: [AuthController, LinkGoogleController],
  providers: [
    AuthService,
    SessionsService,
    AuthTokensService,
    MailService,
    GoogleVerifierService,
    JwtAuthGuard,
    EmailVerifiedGuard,
  ],
  exports: [
    AuthService,
    JwtAuthGuard,
    EmailVerifiedGuard,
    JwtModule,
    SessionsService,
  ],
})
export class AuthModule {}
