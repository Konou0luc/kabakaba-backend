import { Module } from '@nestjs/common';
import { ComponentsController } from './controllers/components.controller';
import { ComponentsService } from './services/components.service';

@Module({
  controllers: [ComponentsController],
  providers: [ComponentsService],
})
export class ComponentsModule {}
