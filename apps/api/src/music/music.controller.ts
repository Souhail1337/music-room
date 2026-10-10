import { Controller, Get, Param, Query } from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiServiceUnavailableResponse,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { SearchTracksQuery } from './dto.js';
import { MusicService } from './music.service.js';
import { PreviewView, TrackListView } from './track.view.js';

@ApiTags('music')
@ApiBearerAuth()
@ApiUnauthorizedResponse({ description: '`UNAUTHORIZED` / `TOKEN_EXPIRED`' })
@Controller('music')
export class MusicController {
  constructor(private readonly music: MusicService) {}

  @Get('search')
  @ApiOperation({
    summary:
      'Search the Deezer catalog (proxied, cached 10 min). Returns up to 25 tracks.',
  })
  @ApiOkResponse({ type: TrackListView })
  @ApiBadRequestResponse({ description: '`VALIDATION_FAILED` (empty `q`)' })
  @ApiServiceUnavailableResponse({ description: '`MUSIC_UNAVAILABLE`' })
  async search(@Query() query: SearchTracksQuery): Promise<TrackListView> {
    return { items: await this.music.search(query.q) };
  }

  @Get('tracks/:id/preview')
  @ApiOperation({
    summary:
      'A fresh 30-second preview URL for a track. Fetch it just before playing; it is never stored.',
  })
  @ApiParam({ name: 'id', description: 'Deezer track ID', example: '3135556' })
  @ApiOkResponse({ type: PreviewView })
  @ApiNotFoundResponse({
    description: '`TRACK_NOT_FOUND` / `PREVIEW_UNAVAILABLE`',
  })
  @ApiServiceUnavailableResponse({ description: '`MUSIC_UNAVAILABLE`' })
  preview(@Param('id') id: string): Promise<PreviewView> {
    return this.music.preview(id);
  }
}
