import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Put,
  Query,
} from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiConflictResponse,
  ApiCreatedResponse,
  ApiExtraModels,
  ApiForbiddenResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiServiceUnavailableResponse,
  ApiTags,
  ApiUnauthorizedResponse,
  getSchemaPath,
} from '@nestjs/swagger';
import { CurrentUser } from '../common/decorators/current-user.decorator.js';
import type { AuthUser } from '../common/decorators/current-user.decorator.js';
import { UserRefList } from '../events/event.view.js';
import {
  AddTrackDto,
  BaseVersionQuery,
  CreatePlaylistDto,
  ListPlaylistsQuery,
  MoveTrackDto,
  UpdatePlaylistDto,
} from './dto/playlist.dto.js';
import {
  PlaylistDetail,
  PlaylistList,
  PlaylistPush,
  VersionConflictDetails,
} from './playlist.view.js';
import { PlaylistsService } from './playlists.service.js';

const PRIVATE_404 = {
  description:
    "`NOT_FOUND` — unknown playlist, or a private playlist you aren't invited to",
};
const READ_ONLY = {
  description:
    '`READ_ONLY` — an "invited only" playlist and you are not invited',
};
const CONFLICT = {
  description:
    '`VERSION_CONFLICT` — `baseVersion` is stale; nothing changed. `details: {playlist, lastEditor}` carries the current state and who made the winning edit.',
  schema: {
    type: 'object',
    properties: {
      code: { type: 'string', example: 'VERSION_CONFLICT' },
      message: { type: 'string' },
      details: { $ref: getSchemaPath(VersionConflictDetails) },
    },
  },
};

@ApiTags('playlists')
@ApiBearerAuth()
@ApiExtraModels(VersionConflictDetails, PlaylistPush)
@ApiUnauthorizedResponse({ description: '`UNAUTHORIZED` / `TOKEN_EXPIRED`' })
@Controller('playlists')
export class PlaylistsController {
  constructor(private readonly playlists: PlaylistsService) {}

  @Get()
  @ApiOperation({
    summary:
      'List playlists. `discover`: public playlists; `mine`: playlists I own; `shared`: playlists I am invited to.',
  })
  @ApiOkResponse({ type: PlaylistList })
  list(
    @CurrentUser() user: AuthUser,
    @Query() query: ListPlaylistsQuery,
  ): Promise<PlaylistList> {
    return this.playlists.list(user.id, query.scope, query.q, query.cursor);
  }

  @Post()
  @ApiOperation({ summary: 'Create a playlist. The caller becomes its owner.' })
  @ApiCreatedResponse({ type: PlaylistDetail })
  @ApiBadRequestResponse({ description: '`VALIDATION_FAILED`' })
  create(
    @CurrentUser() user: AuthUser,
    @Body() dto: CreatePlaylistDto,
  ): Promise<PlaylistDetail> {
    return this.playlists.create(user.id, dto);
  }

  @Get(':id')
  @ApiOperation({
    summary:
      'Playlist state (ordered tracks, version, lastEditor) plus your own `canEdit`, `isOwner` and who has it open. Live updates: join `playlist:<id>` over Socket.IO and apply `playlist.updated` (PlaylistPush).',
  })
  @ApiParam({ name: 'id', format: 'uuid' })
  @ApiOkResponse({ type: PlaylistDetail })
  @ApiNotFoundResponse(PRIVATE_404)
  get(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
  ): Promise<PlaylistDetail> {
    return this.playlists.get(user.id, id);
  }

  @Patch(':id')
  @ApiOperation({
    summary: 'Edit name, description, visibility or edit license (owner only).',
  })
  @ApiParam({ name: 'id', format: 'uuid' })
  @ApiOkResponse({ type: PlaylistDetail })
  @ApiBadRequestResponse({ description: '`VALIDATION_FAILED`' })
  @ApiForbiddenResponse({ description: '`NOT_OWNER`' })
  @ApiNotFoundResponse(PRIVATE_404)
  update(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: UpdatePlaylistDto,
  ): Promise<PlaylistDetail> {
    return this.playlists.update(user.id, id, dto);
  }

  @Get(':id/invites')
  @ApiOperation({ summary: 'People invited to the playlist (owner only).' })
  @ApiParam({ name: 'id', format: 'uuid' })
  @ApiOkResponse({ type: UserRefList })
  @ApiForbiddenResponse({ description: '`NOT_OWNER`' })
  @ApiNotFoundResponse(PRIVATE_404)
  invites(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
  ): Promise<UserRefList> {
    return this.playlists.invites(user.id, id);
  }

  @Put(':id/invites/:userId')
  @ApiOperation({
    summary:
      'Invite a user (owner only, idempotent). Invitees can view a private playlist and edit an "invited only" one. Returns the invite list.',
  })
  @ApiParam({ name: 'id', format: 'uuid' })
  @ApiParam({ name: 'userId', format: 'uuid' })
  @ApiOkResponse({ type: UserRefList })
  @ApiBadRequestResponse({ description: '`VALIDATION_FAILED` (yourself)' })
  @ApiForbiddenResponse({ description: '`NOT_OWNER`' })
  @ApiNotFoundResponse({ description: '`NOT_FOUND` / `USER_NOT_FOUND`' })
  invite(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Param('userId') userId: string,
  ): Promise<UserRefList> {
    return this.playlists.setInvite(user.id, id, userId, true);
  }

  @Delete(':id/invites/:userId')
  @ApiOperation({
    summary:
      'Remove an invite (owner only, idempotent). Returns the invite list.',
  })
  @ApiParam({ name: 'id', format: 'uuid' })
  @ApiParam({ name: 'userId', format: 'uuid' })
  @ApiOkResponse({ type: UserRefList })
  @ApiForbiddenResponse({ description: '`NOT_OWNER`' })
  @ApiNotFoundResponse(PRIVATE_404)
  uninvite(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Param('userId') userId: string,
  ): Promise<UserRefList> {
    return this.playlists.setInvite(user.id, id, userId, false);
  }

  @Post(':id/tracks')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary:
      'Add a track at the end. Needs the current `baseVersion` (AD-3). Returns the playlist.',
  })
  @ApiParam({ name: 'id', format: 'uuid' })
  @ApiOkResponse({ type: PlaylistDetail })
  @ApiBadRequestResponse({ description: '`VALIDATION_FAILED`' })
  @ApiForbiddenResponse(READ_ONLY)
  @ApiNotFoundResponse({ description: '`NOT_FOUND` / `TRACK_NOT_FOUND`' })
  @ApiConflictResponse({
    ...CONFLICT,
    description: `${CONFLICT.description} Or \`TRACK_ALREADY_IN_PLAYLIST\`.`,
  })
  @ApiServiceUnavailableResponse({ description: '`MUSIC_UNAVAILABLE`' })
  addTrack(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: AddTrackDto,
  ): Promise<PlaylistDetail> {
    return this.playlists.addTrack(user.id, id, dto.trackId, dto.baseVersion);
  }

  @Patch(':id/tracks/:entryId')
  @ApiOperation({
    summary:
      'Move an entry to `toIndex` (its final 0-based index); the others shift. Needs the current `baseVersion`.',
  })
  @ApiParam({ name: 'id', format: 'uuid' })
  @ApiParam({ name: 'entryId', format: 'uuid', description: 'Entry id' })
  @ApiOkResponse({ type: PlaylistDetail })
  @ApiBadRequestResponse({
    description: '`VALIDATION_FAILED` (e.g. `toIndex` out of range)',
  })
  @ApiForbiddenResponse(READ_ONLY)
  @ApiNotFoundResponse({ description: '`NOT_FOUND` (playlist or entry)' })
  @ApiConflictResponse(CONFLICT)
  moveTrack(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Param('entryId') entryId: string,
    @Body() dto: MoveTrackDto,
  ): Promise<PlaylistDetail> {
    return this.playlists.moveTrack(
      user.id,
      id,
      entryId,
      dto.toIndex,
      dto.baseVersion,
    );
  }

  @Delete(':id/tracks/:entryId')
  @ApiOperation({
    summary:
      'Remove an entry; positions are compacted. Needs `?baseVersion=` (the current version).',
  })
  @ApiParam({ name: 'id', format: 'uuid' })
  @ApiParam({ name: 'entryId', format: 'uuid', description: 'Entry id' })
  @ApiOkResponse({ type: PlaylistDetail })
  @ApiBadRequestResponse({ description: '`VALIDATION_FAILED`' })
  @ApiForbiddenResponse(READ_ONLY)
  @ApiNotFoundResponse({ description: '`NOT_FOUND` (playlist or entry)' })
  @ApiConflictResponse(CONFLICT)
  removeTrack(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Param('entryId') entryId: string,
    @Query() query: BaseVersionQuery,
  ): Promise<PlaylistDetail> {
    return this.playlists.removeTrack(user.id, id, entryId, query.baseVersion);
  }
}
