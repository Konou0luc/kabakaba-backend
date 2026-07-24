import { Module } from '@nestjs/common';
import { UsersController } from './controllers/users.controller';
import { SuspensionsController } from './controllers/suspensions.controller';
import { UsersService } from './services/users.service';
import { SuspensionsService } from './services/suspensions.service';

@Module({
  controllers: [UsersController, SuspensionsController],
  providers: [UsersService, SuspensionsService],
  exports: [UsersService, SuspensionsService],
})
export class UsersModule {}