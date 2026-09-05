import { Module } from '@nestjs/common';
import { CampusesController } from './controllers/campuses.controller';
import { CampusesService } from './services/campuses.service';
import { FacultiesController } from './faculties/controllers/faculties.controller';
import { FacultiesService } from './faculties/services/faculties.service';

@Module({
  controllers: [CampusesController, FacultiesController],
  providers: [CampusesService, FacultiesService]
})
export class CampusesModule {}
