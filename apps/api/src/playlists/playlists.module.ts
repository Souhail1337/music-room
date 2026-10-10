import { Module } from '@nestjs/common';
import { AccessModule } from '../access/access.module.js';
import { MusicModule } from '../music/music.module.js';
import { RealtimeModule } from '../realtime/realtime.module.js';
import { UsersModule } from '../users/users.module.js';
import { PlaylistsController } from './playlists.controller.js';
import { PlaylistsRepository } from './playlists.repository.js';
import { PlaylistsService } from './playlists.service.js';

/** Playlist Editor (FR-17..FR-21). UsersModule only resolves presence names. */
@Module({
  imports: [AccessModule, MusicModule, RealtimeModule, UsersModule],
  controllers: [PlaylistsController],
  providers: [PlaylistsRepository, PlaylistsService],
})
export class PlaylistsModule {}
