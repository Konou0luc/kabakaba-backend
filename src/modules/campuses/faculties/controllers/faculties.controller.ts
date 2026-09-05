import { Body, Controller, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { UserRole, WebUserRole } from '@prisma/client';
import { FacultiesService } from '../services/faculties.service';
import { CreateFacultyDto } from '../dto/create-faculty.dto';
import { UpdateFacultyDto } from '../dto/update-faculty.dto';
import { Roles } from '../../../../common/decorators/roles.decorator';
import { WebRoles } from '../../../../common/decorators/web-roles.decorator';
import { CombinedJwtAuthGuard } from '../../../../common/guards/combined-jwt-auth.guard';
import { CombinedRolesGuard } from '../../../../common/guards/combined-roles.guard';
import { Public } from '../../../../common/decorators/public.decorator';

// Facultés déclarées par campus : liste proposée aux étudiants lors de la
// demande de statut ambassadeur. Le modèle FacultyList existait déjà en
// base sans être exposé par aucun contrôleur.
@ApiTags('Faculties')
@Controller('campuses/:campusId/faculties')
export class FacultiesController {
  constructor(private readonly facultiesService: FacultiesService) {}

  @Get()
  @Public()
  @ApiOperation({ summary: "Lister les facultés d'un campus (public : utilisé par le formulaire de demande ambassadeur)" })
  @ApiResponse({ status: 200, description: 'Liste des facultés.' })
  findAll(@Param('campusId') campusId: string) {
    return this.facultiesService.findAll(campusId);
  }

  @Post()
  @ApiBearerAuth()
  @UseGuards(CombinedJwtAuthGuard, CombinedRolesGuard)
  @Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN)
  @WebRoles(WebUserRole.ADMIN)
  @ApiOperation({ summary: 'Ajouter une faculté à un campus (Admin)' })
  @ApiResponse({ status: 201, description: 'La faculté a été créée.' })
  create(@Param('campusId') campusId: string, @Body() dto: CreateFacultyDto) {
    return this.facultiesService.create(campusId, dto);
  }

  @Patch(':id')
  @ApiBearerAuth()
  @UseGuards(CombinedJwtAuthGuard, CombinedRolesGuard)
  @Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN)
  @WebRoles(WebUserRole.ADMIN)
  @ApiOperation({ summary: 'Activer/désactiver une faculté (Admin)' })
  @ApiResponse({ status: 200, description: 'La faculté a été mise à jour.' })
  update(@Param('campusId') campusId: string, @Param('id') id: string, @Body() dto: UpdateFacultyDto) {
    return this.facultiesService.update(campusId, id, dto);
  }
}
