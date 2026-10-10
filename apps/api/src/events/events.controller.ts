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
  ApiCreatedResponse,
  ApiForbiddenResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiServiceUnavailableResponse,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { CurrentUser } from '../common/decorators/current-user.decorator.js';
import type { AuthUser } from '../common/decorators/current-user.decorator.js';
import {
  AdvanceDto,
  CreateEventDto,
  ListEventsQuery,
  LocationDto,
  LocationQuery,
  SuggestDto,
  UpdateEventDto,
} from './dto/event.dto.js';
import { EventDetail, EventList, UserRefList } from './event.view.js';
import { EventsService } from './events.service.js';

const PRIVATE_404 = {
  description:
    "`NOT_FOUND` — unknown event, or a private event you aren't invited to",
};
const CANNOT_ACT = {
  description:
    '`NOT_INVITED` / `OUTSIDE_AREA` / `OUTSIDE_TIME_WINDOW` (details: `{startsAt, endsAt}`)',
};
const BAD_REQUEST = {
  description:
    '`VALIDATION_FAILED`, or `LOCATION_REQUIRED` on an on-site event without `lat`/`lng`',
};

@ApiTags('events')
@ApiBearerAuth()
@ApiUnauthorizedResponse({ description: '`UNAUTHORIZED` / `TOKEN_EXPIRED`' })
@Controller('events')
export class EventsController {
  constructor(private readonly events: EventsService) {}

  @Get()
  @ApiOperation({
    summary:
      'List events. `discover`: public events (live first); `hosting`: mine; `invited`; `joined` (I suggested or voted).',
  })
  @ApiOkResponse({ type: EventList })
  list(
    @CurrentUser() user: AuthUser,
    @Query() query: ListEventsQuery,
  ): Promise<EventList> {
    return this.events.list(user.id, query.scope, query.q, query.cursor);
  }

  @Post()
  @ApiOperation({ summary: 'Create an event. The caller becomes its host.' })
  @ApiCreatedResponse({ type: EventDetail })
  @ApiBadRequestResponse({
    description:
      '`VALIDATION_FAILED` (e.g. on-site without venue, radius or window)',
  })
  create(
    @CurrentUser() user: AuthUser,
    @Body() dto: CreateEventDto,
  ): Promise<EventDetail> {
    return this.events.create(user.id, dto);
  }

  @Get(':id')
  @ApiOperation({
    summary:
      'Event state (Now Playing, ranked queue, version) plus your own `myVotes` and `canAct`. Pass `lat`/`lng` on on-site events.',
  })
  @ApiParam({ name: 'id', format: 'uuid' })
  @ApiOkResponse({ type: EventDetail })
  @ApiNotFoundResponse(PRIVATE_404)
  get(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Query() location: LocationQuery,
  ): Promise<EventDetail> {
    return this.events.get(user.id, id, location);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Edit an event (host only).' })
  @ApiParam({ name: 'id', format: 'uuid' })
  @ApiOkResponse({ type: EventDetail })
  @ApiBadRequestResponse({ description: '`VALIDATION_FAILED`' })
  @ApiForbiddenResponse({ description: '`NOT_HOST`' })
  @ApiNotFoundResponse(PRIVATE_404)
  update(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: UpdateEventDto,
  ): Promise<EventDetail> {
    return this.events.update(user.id, id, dto);
  }

  @Get(':id/invites')
  @ApiOperation({ summary: 'People invited to the event (host only).' })
  @ApiParam({ name: 'id', format: 'uuid' })
  @ApiOkResponse({ type: UserRefList })
  @ApiForbiddenResponse({ description: '`NOT_HOST`' })
  @ApiNotFoundResponse(PRIVATE_404)
  invites(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
  ): Promise<UserRefList> {
    return this.events.invites(user.id, id);
  }

  @Put(':id/invites/:userId')
  @ApiOperation({
    summary: 'Invite a user (host only, idempotent). Returns the invite list.',
  })
  @ApiParam({ name: 'id', format: 'uuid' })
  @ApiParam({ name: 'userId', format: 'uuid' })
  @ApiOkResponse({ type: UserRefList })
  @ApiForbiddenResponse({ description: '`NOT_HOST`' })
  @ApiNotFoundResponse({ description: '`NOT_FOUND` / `USER_NOT_FOUND`' })
  invite(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Param('userId') userId: string,
  ): Promise<UserRefList> {
    return this.events.setInvite(user.id, id, userId, true);
  }

  @Delete(':id/invites/:userId')
  @ApiOperation({
    summary:
      'Remove an invite (host only, idempotent). Returns the invite list.',
  })
  @ApiParam({ name: 'id', format: 'uuid' })
  @ApiParam({ name: 'userId', format: 'uuid' })
  @ApiOkResponse({ type: UserRefList })
  @ApiForbiddenResponse({ description: '`NOT_HOST`' })
  @ApiNotFoundResponse(PRIVATE_404)
  uninvite(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Param('userId') userId: string,
  ): Promise<UserRefList> {
    return this.events.setInvite(user.id, id, userId, false);
  }

  @Post(':id/suggestions')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary:
      'Suggest a track. New tracks join the queue with your vote; a queued track gets your vote instead (idempotent).',
  })
  @ApiParam({ name: 'id', format: 'uuid' })
  @ApiOkResponse({ type: EventDetail })
  @ApiBadRequestResponse(BAD_REQUEST)
  @ApiForbiddenResponse(CANNOT_ACT)
  @ApiNotFoundResponse({ description: '`NOT_FOUND` / `TRACK_NOT_FOUND`' })
  @ApiServiceUnavailableResponse({ description: '`MUSIC_UNAVAILABLE`' })
  suggest(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: SuggestDto,
  ): Promise<EventDetail> {
    return this.events.suggest(user.id, id, dto.trackId, dto);
  }

  @Put(':id/suggestions/:sid/vote')
  @ApiOperation({
    summary: 'Vote for a queued track (one vote per user; idempotent).',
  })
  @ApiParam({ name: 'id', format: 'uuid' })
  @ApiParam({ name: 'sid', format: 'uuid', description: 'Suggestion id' })
  @ApiOkResponse({ type: EventDetail })
  @ApiBadRequestResponse(BAD_REQUEST)
  @ApiForbiddenResponse(CANNOT_ACT)
  @ApiNotFoundResponse(PRIVATE_404)
  vote(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Param('sid') sid: string,
    @Body() location: LocationDto,
  ): Promise<EventDetail> {
    return this.events.vote(user.id, id, sid, location);
  }

  @Delete(':id/suggestions/:sid/vote')
  @ApiOperation({ summary: 'Remove your vote (idempotent).' })
  @ApiParam({ name: 'id', format: 'uuid' })
  @ApiParam({ name: 'sid', format: 'uuid', description: 'Suggestion id' })
  @ApiOkResponse({ type: EventDetail })
  @ApiNotFoundResponse(PRIVATE_404)
  unvote(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Param('sid') sid: string,
    @Query() location: LocationQuery,
  ): Promise<EventDetail> {
    return this.events.unvote(user.id, id, sid, location);
  }

  @Post(':id/advance')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary:
      'Host only: the top suggestion becomes Now Playing. If `expectedNowPlayingId` no longer matches, nothing changes and the current state is returned.',
  })
  @ApiParam({ name: 'id', format: 'uuid' })
  @ApiOkResponse({ type: EventDetail })
  @ApiForbiddenResponse({ description: '`NOT_HOST`' })
  @ApiNotFoundResponse(PRIVATE_404)
  advance(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: AdvanceDto,
  ): Promise<EventDetail> {
    return this.events.advance(user.id, id, dto.expectedNowPlayingId);
  }
}
