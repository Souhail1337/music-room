import { Controller, Get } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiForbiddenResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { CurrentUser } from '../common/decorators/current-user.decorator.js';
import type { AuthUser } from '../common/decorators/current-user.decorator.js';
import { Errors } from '../common/errors/app-error.js';
import { UsersService } from './users.service.js';
import { MeView } from './user.view.js';

@ApiTags('users')
@ApiBearerAuth()
@Controller()
export class UsersController {
  constructor(private readonly users: UsersService) {}

  @Get('me')
  @ApiOperation({
    summary:
      'The logged-in user (minimal; the full profile arrives in spec D).',
  })
  @ApiOkResponse({ type: MeView })
  @ApiUnauthorizedResponse({
    description: '`UNAUTHORIZED` / `TOKEN_EXPIRED` / `SESSION_REVOKED`',
  })
  @ApiForbiddenResponse({ description: '`EMAIL_NOT_VERIFIED`' })
  async me(@CurrentUser() current: AuthUser): Promise<MeView> {
    const user = await this.users.findById(current.id);
    if (!user) throw Errors.unauthorized();
    return MeView.of(user);
  }
}
