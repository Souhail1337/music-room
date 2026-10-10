import { Controller, Get, Query } from '@nestjs/common';
import {
  ApiBadRequestResponse,
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
import { SearchUsersQuery } from './users.dto.js';
import { MeView, UserSummaryList } from './user.view.js';

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

  @Get('users/search')
  @ApiOperation({
    summary:
      'Find people to invite: display-name prefix or exact email. Returns only id and display name; never yourself.',
  })
  @ApiOkResponse({ type: UserSummaryList })
  @ApiBadRequestResponse({
    description: '`VALIDATION_FAILED` (`q` shorter than 2 characters)',
  })
  async search(
    @CurrentUser() current: AuthUser,
    @Query() query: SearchUsersQuery,
  ): Promise<UserSummaryList> {
    return { items: await this.users.search(query.q, current.id) };
  }
}
