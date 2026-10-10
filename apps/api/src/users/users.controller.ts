import { Body, Controller, Get, Param, Patch, Query } from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiForbiddenResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { CurrentUser } from '../common/decorators/current-user.decorator.js';
import type { AuthUser } from '../common/decorators/current-user.decorator.js';
import { Errors } from '../common/errors/app-error.js';
import { UsersService } from './users.service.js';
import { SearchUsersQuery, UpdateProfileDto } from './users.dto.js';
import { MeView, ProfileView, UserSummaryList } from './user.view.js';

@ApiTags('users')
@ApiBearerAuth()
@Controller()
export class UsersController {
  constructor(private readonly users: UsersService) {}

  @Get('me')
  @ApiOperation({
    summary:
      'The logged-in account (email, linked sign-in methods). The profile sections are under `/me/profile`.',
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
      'Find people to invite or add: display-name prefix or exact email, at most 20. Returns only id, display name and `isFriend` (friends first); never yourself.',
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

  @Get('me/profile')
  @ApiOperation({
    summary:
      'Your whole profile: display name and all four sections (Public, Friends only, Private, Music preferences).',
  })
  @ApiOkResponse({ type: ProfileView })
  myProfile(@CurrentUser() current: AuthUser): Promise<ProfileView> {
    return this.users.myProfile(current.id);
  }

  @Patch('me/profile')
  @ApiOperation({
    summary:
      'Edit your display name and/or profile sections. Only the sections and fields you send change; an empty string or list clears a field.',
  })
  @ApiOkResponse({ type: ProfileView })
  @ApiBadRequestResponse({
    description:
      '`VALIDATION_FAILED` — a field too long, a bad birthday (YYYY-MM-DD), more than 10 genres/artists, or an unknown field',
  })
  updateProfile(
    @CurrentUser() current: AuthUser,
    @Body() dto: UpdateProfileDto,
  ): Promise<ProfileView> {
    return this.users.updateProfile(current.id, dto);
  }

  @Get('users/:id/profile')
  @ApiOperation({
    summary:
      "Someone's profile, cut down to what you may see (AD-7): Public and Music preferences for everyone, Friends only for friends, Private only on your own. Hidden sections are absent; email is never included.",
  })
  @ApiParam({ name: 'id', format: 'uuid' })
  @ApiOkResponse({ type: ProfileView })
  @ApiNotFoundResponse({ description: '`USER_NOT_FOUND`' })
  profile(
    @CurrentUser() current: AuthUser,
    @Param('id') id: string,
  ): Promise<ProfileView> {
    return this.users.profileOf(current.id, id);
  }
}
