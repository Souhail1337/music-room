import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  Query,
  Res,
} from '@nestjs/common';
import {
  ApiAcceptedResponse,
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiBody,
  ApiConflictResponse,
  ApiConsumes,
  ApiCreatedResponse,
  ApiNoContentResponse,
  ApiOkResponse,
  ApiOperation,
  ApiProduces,
  ApiServiceUnavailableResponse,
  ApiTags,
  ApiTooManyRequestsResponse,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import type { Response } from 'express';
import { CurrentUser } from '../common/decorators/current-user.decorator.js';
import type { AuthUser } from '../common/decorators/current-user.decorator.js';
import {
  AuthThrottle,
  Public,
  SkipEmailVerified,
} from '../common/decorators/public.decorator.js';
import { AuthPages } from './auth-pages.js';
import { AuthService } from './auth.service.js';
import {
  AuthResponse,
  ForgotPasswordDto,
  GoogleLoginDto,
  LoginDto,
  MessageResponse,
  RefreshDto,
  ResetPasswordFormDto,
  SignupDto,
  TokenQueryDto,
  TokensResponse,
} from './dto/auth.dto.js';

/** The link pages carry a token in their URL: never cache them or leak it as a referrer. */
function sendPage(res: Response, status: number, html: string): void {
  res
    .status(status)
    .set({ 'Cache-Control': 'no-store', 'Referrer-Policy': 'no-referrer' })
    .type('html')
    .send(html);
}

const RATE_LIMITED = {
  description: '`RATE_LIMITED` — 5 requests/min per IP+account',
};

@ApiTags('auth')
@SkipEmailVerified()
@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Public()
  @AuthThrottle()
  @Post('signup')
  @ApiOperation({
    summary:
      'Create an email account; sends a verification link (24h, single use).',
  })
  @ApiCreatedResponse({
    type: AuthResponse,
    description:
      'Session issued; the user stays unverified until the link is used.',
  })
  @ApiBadRequestResponse({
    description: '`VALIDATION_FAILED` (e.g. password shorter than 8)',
  })
  @ApiConflictResponse({ description: '`EMAIL_TAKEN`' })
  @ApiTooManyRequestsResponse(RATE_LIMITED)
  signup(@Body() dto: SignupDto): Promise<AuthResponse> {
    return this.auth.signup(dto);
  }

  @Public()
  @AuthThrottle()
  @Post('login')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Log in with email and password.' })
  @ApiOkResponse({ type: AuthResponse })
  @ApiUnauthorizedResponse({ description: '`INVALID_CREDENTIALS`' })
  @ApiTooManyRequestsResponse(RATE_LIMITED)
  login(@Body() dto: LoginDto): Promise<AuthResponse> {
    return this.auth.login(dto.email, dto.password);
  }

  @Public()
  @AuthThrottle()
  @Post('google')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary:
      'Sign up or log in with a Google ID token (verified on the server).',
  })
  @ApiOkResponse({ type: AuthResponse })
  @ApiUnauthorizedResponse({ description: '`GOOGLE_TOKEN_INVALID`' })
  @ApiConflictResponse({
    description:
      '`ACCOUNT_EXISTS` — an email account already uses this address',
  })
  @ApiServiceUnavailableResponse({ description: '`GOOGLE_NOT_CONFIGURED`' })
  @ApiTooManyRequestsResponse(RATE_LIMITED)
  google(@Body() dto: GoogleLoginDto): Promise<AuthResponse> {
    return this.auth.loginWithGoogle(dto.idToken);
  }

  @Public()
  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary:
      'Rotate the refresh token. Reusing an old one revokes the whole session family.',
  })
  @ApiOkResponse({ type: TokensResponse })
  @ApiUnauthorizedResponse({
    description: '`SESSION_REVOKED` / `SESSION_EXPIRED`',
  })
  refresh(@Body() dto: RefreshDto): Promise<TokensResponse> {
    return this.auth.refresh(dto.refreshToken);
  }

  @Public()
  @Post('logout')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({
    summary: 'End the session (the refresh token’s family) on the server.',
  })
  @ApiNoContentResponse()
  logout(@Body() dto: RefreshDto): Promise<void> {
    return this.auth.logout(dto.refreshToken);
  }

  @ApiBearerAuth()
  @AuthThrottle()
  @Post('resend-verification')
  @HttpCode(HttpStatus.ACCEPTED)
  @ApiOperation({
    summary: 'Send a new verification link to the logged-in (unverified) user.',
  })
  @ApiAcceptedResponse({ type: MessageResponse })
  @ApiUnauthorizedResponse({
    description: '`UNAUTHORIZED` / `TOKEN_EXPIRED` / `SESSION_REVOKED`',
  })
  @ApiTooManyRequestsResponse(RATE_LIMITED)
  async resendVerification(
    @CurrentUser() user: AuthUser,
  ): Promise<MessageResponse> {
    await this.auth.resendVerification(user.id);
    return { message: 'Check your email to finish signing up.' };
  }

  @Public()
  @AuthThrottle()
  @Post('forgot')
  @HttpCode(HttpStatus.ACCEPTED)
  @ApiOperation({
    summary:
      'Request a password-reset link (1h, single use). Same answer for unknown emails.',
  })
  @ApiAcceptedResponse({ type: MessageResponse })
  @ApiTooManyRequestsResponse(RATE_LIMITED)
  async forgot(@Body() dto: ForgotPasswordDto): Promise<MessageResponse> {
    await this.auth.forgotPassword(dto.email);
    return {
      message: "If an account exists for this email, we've sent a reset link.",
    };
  }

  @Public()
  @Get('verify')
  @ApiOperation({
    summary: 'Email verification link target. Returns an HTML page.',
  })
  @ApiProduces('text/html')
  @ApiOkResponse({ description: 'HTML “You can return to the app”.' })
  @ApiBadRequestResponse({
    description: 'HTML error page (expired, unknown or already used link).',
  })
  async verify(
    @Query() query: TokenQueryDto,
    @Res() res: Response,
  ): Promise<void> {
    const ok = await this.auth.verifyEmail(query.token);
    sendPage(res, ok ? 200 : 400, ok ? AuthPages.verified() : AuthPages.verifyInvalid());
  }

  @Public()
  @AuthThrottle()
  @Get('reset')
  @ApiOperation({
    summary: 'Password-reset link target. Returns an HTML form.',
  })
  @ApiProduces('text/html')
  @ApiOkResponse({
    description: 'HTML form posting to POST /auth/reset?token=.',
  })
  @ApiBadRequestResponse({
    description: 'HTML error page (expired, unknown or already used link).',
  })
  async resetForm(
    @Query() query: TokenQueryDto,
    @Res() res: Response,
  ): Promise<void> {
    const ok = await this.auth.isResetTokenUsable(query.token);
    sendPage(res, ok ? 200 : 400, ok ? AuthPages.resetForm() : AuthPages.resetInvalid());
  }

  @Public()
  @AuthThrottle()
  @Post('reset')
  @ApiOperation({
    summary:
      'Set a new password from the reset page. Revokes every session of the user.',
  })
  @ApiConsumes('application/x-www-form-urlencoded', 'application/json')
  @ApiBody({ type: ResetPasswordFormDto })
  @ApiProduces('text/html')
  @ApiOkResponse({ description: 'HTML “Password changed”.' })
  @ApiBadRequestResponse({
    description: 'HTML error page or the form again with an error.',
  })
  async reset(
    @Query() query: TokenQueryDto,
    @Body() dto: ResetPasswordFormDto,
    @Res() res: Response,
  ): Promise<void> {
    const result = await this.auth.resetPassword(
      query.token,
      dto.password,
      dto.confirm,
    );
    const html =
      result === 'ok'
        ? AuthPages.resetDone()
        : result === 'invalid'
          ? AuthPages.resetInvalid()
          : AuthPages.resetForm(
              result === 'weak'
                ? 'Use at least 8 characters.'
                : 'The two passwords don’t match.',
            );
    sendPage(res, result === 'ok' ? 200 : 400, html);
  }
}
