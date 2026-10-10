import { Module } from '@nestjs/common';
import { FriendsController } from './friends.controller.js';
import { FriendsRepository } from './friends.repository.js';
import { FriendsService } from './friends.service.js';
import { UsersController } from './users.controller.js';
import { UsersRepository } from './users.repository.js';
import { UsersService } from './users.service.js';

@Module({
  controllers: [UsersController, FriendsController],
  providers: [UsersRepository, UsersService, FriendsRepository, FriendsService],
  exports: [UsersService, FriendsService],
})
export class UsersModule {}
