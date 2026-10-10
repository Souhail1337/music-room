import { Module } from '@nestjs/common';
import { DeezerClient } from './deezer.client.js';
import { MusicController } from './music.controller.js';
import { MusicService } from './music.service.js';
import { TracksRepository } from './tracks.repository.js';

@Module({
  controllers: [MusicController],
  providers: [
    DeezerClient,
    TracksRepository,
    {
      provide: MusicService,
      inject: [DeezerClient, TracksRepository],
      useFactory: (deezer: DeezerClient, tracks: TracksRepository) =>
        new MusicService(deezer, tracks),
    },
  ],
  exports: [MusicService],
})
export class MusicModule {}
