import { Module } from '@nestjs/common';
import { AccessModule } from '../access/access.module.js';
import { MusicModule } from '../music/music.module.js';
import { RealtimeModule } from '../realtime/realtime.module.js';
import { EventsController } from './events.controller.js';
import { EventsRepository } from './events.repository.js';
import { EventsService } from './events.service.js';

@Module({
  imports: [AccessModule, MusicModule, RealtimeModule],
  controllers: [EventsController],
  providers: [EventsRepository, EventsService],
})
export class EventsModule {}
