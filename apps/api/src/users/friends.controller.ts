import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
} from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiConflictResponse,
  ApiNoContentResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { CurrentUser } from '../common/decorators/current-user.decorator.js';
import type { AuthUser } from '../common/decorators/current-user.decorator.js';
import { FriendsService } from './friends.service.js';
import { FriendRequestDto } from './users.dto.js';
import { FriendList, FriendRequests, ProfileView } from './user.view.js';

const NO_REQUEST = {
  description:
    '`NOT_FOUND` — no such pending request, or you are not the person who can act on it',
};

@ApiTags('friends')
@ApiBearerAuth()
@ApiUnauthorizedResponse({ description: '`UNAUTHORIZED` / `TOKEN_EXPIRED`' })
@Controller('friends')
export class FriendsController {
  constructor(private readonly friends: FriendsService) {}

  @Get()
  @ApiOperation({ summary: 'Your friends, sorted by display name.' })
  @ApiOkResponse({ type: FriendList })
  list(@CurrentUser() user: AuthUser): Promise<FriendList> {
    return this.friends.list(user.id);
  }

  @Get('requests')
  @ApiOperation({
    summary:
      'Pending friend requests: `incoming` (people asking you) and `outgoing` (people you asked).',
  })
  @ApiOkResponse({ type: FriendRequests })
  requests(@CurrentUser() user: AuthUser): Promise<FriendRequests> {
    return this.friends.requests(user.id);
  }

  @Post('requests')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary:
      'Ask someone to be friends. If they already asked you, you become friends right away. Asking twice changes nothing. Returns their profile as you now see it.',
  })
  @ApiOkResponse({ type: ProfileView })
  @ApiBadRequestResponse({ description: '`VALIDATION_FAILED` — yourself' })
  @ApiNotFoundResponse({ description: '`USER_NOT_FOUND`' })
  @ApiConflictResponse({ description: '`ALREADY_FRIENDS`' })
  request(
    @CurrentUser() user: AuthUser,
    @Body() dto: FriendRequestDto,
  ): Promise<ProfileView> {
    return this.friends.request(user.id, dto.userId);
  }

  @Post('requests/:id/accept')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary:
      'Accept a request someone sent you. Returns their profile (now including Friends info).',
  })
  @ApiParam({ name: 'id', format: 'uuid', description: 'Friend request id' })
  @ApiOkResponse({ type: ProfileView })
  @ApiNotFoundResponse(NO_REQUEST)
  accept(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
  ): Promise<ProfileView> {
    return this.friends.accept(user.id, id);
  }

  @Post('requests/:id/decline')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Decline a request someone sent you (deletes it).' })
  @ApiParam({ name: 'id', format: 'uuid', description: 'Friend request id' })
  @ApiNoContentResponse({ description: 'Declined.' })
  @ApiNotFoundResponse(NO_REQUEST)
  decline(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
  ): Promise<void> {
    return this.friends.decline(user.id, id);
  }

  @Delete('requests/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Cancel a request you sent (deletes it).' })
  @ApiParam({ name: 'id', format: 'uuid', description: 'Friend request id' })
  @ApiNoContentResponse({ description: 'Cancelled.' })
  @ApiNotFoundResponse(NO_REQUEST)
  cancel(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
  ): Promise<void> {
    return this.friends.cancel(user.id, id);
  }

  @Delete(':userId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Remove a friend (for both of you).' })
  @ApiParam({ name: 'userId', format: 'uuid' })
  @ApiNoContentResponse({ description: 'Removed.' })
  @ApiNotFoundResponse({ description: "`NOT_FOUND` — you aren't friends" })
  remove(
    @CurrentUser() user: AuthUser,
    @Param('userId') userId: string,
  ): Promise<void> {
    return this.friends.remove(user.id, userId);
  }
}
