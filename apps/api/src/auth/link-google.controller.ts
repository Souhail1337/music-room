import { Body, Controller, HttpCode, HttpStatus, Post } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiConflictResponse,
  ApiOkResponse,
  ApiOperation,
  ApiServiceUnavailableResponse,
  ApiTags,
  ApiTooManyRequestsResponse,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { CurrentUser } from '../common/decorators/current-user.decorator.js';
import type { AuthUser } from '../common/decorators/current-user.decorator.js';
import { AuthThrottle } from '../common/decorators/public.decorator.js';
import { MeView } from '../users/user.view.js';
import { AuthService } from './auth.service.js';
import { GoogleLoginDto } from './dto/auth.dto.js';

/** FR-3: link a Google account to the logged-in account, so "Continue with Google" opens it too. */
@ApiTags('users')
@ApiBearerAuth()
@Controller('me')
export class LinkGoogleController {
  constructor(private readonly auth: AuthService) {}

  @AuthThrottle()
  @Post('google')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary:
      'Link a Google account (ID token verified by the server). Link-only: there is no unlink. Linking the same account again changes nothing.',
  })
  @ApiOkResponse({ type: MeView, description: '`hasGoogle` is now true.' })
  @ApiUnauthorizedResponse({
    description:
      '`GOOGLE_TOKEN_INVALID` (bad, expired or unverified token) / `UNAUTHORIZED`',
  })
  @ApiConflictResponse({
    description:
      '`GOOGLE_ALREADY_LINKED` — this Google account belongs to another user, or yours is linked to a different one',
  })
  @ApiServiceUnavailableResponse({ description: '`GOOGLE_NOT_CONFIGURED`' })
  @ApiTooManyRequestsResponse({
    description: '`RATE_LIMITED` — 5 requests/min per IP+account',
  })
  link(
    @CurrentUser() user: AuthUser,
    @Body() dto: GoogleLoginDto,
  ): Promise<MeView> {
    return this.auth.linkGoogle(user.id, dto.idToken);
  }
}
