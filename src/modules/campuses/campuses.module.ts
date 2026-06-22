import { Module } from '@nestjs/common';
import { CampusesController } from './controllers/campuses.controller';
import { CampusesService } from './services/campuses.service';

@Module({
  controllers: [CampusesController],
  providers: [CampusesService]
})
export class CampusesModule {}
