import { Module } from '@nestjs/common';
import { UsersController } from './controllers/users.controller';
import { UsersService } from './services/users.service';
import { SuspensionsService } from './services/suspensions.service';

@Module({
  controllers: [UsersController],
  providers: [UsersService, SuspensionsService],
  exports: [UsersService, SuspensionsService],
})
export class UsersModule {}