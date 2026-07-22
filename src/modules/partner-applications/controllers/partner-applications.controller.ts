import { Body, Controller, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiQuery, ApiResponse, ApiTags } from '@nestjs/swagger';
import { UserRole } from '@prisma/client';
import { PartnerApplicationsService } from '../services/partner-applications.service';
import { CreatePartnerApplicationDto } from '../dto/create-partner-application.dto';
import { UpdatePartnerApplicationDto } from '../dto/update-partner-application.dto';
import { FindPartnerApplicationsQueryDto } from '../dto/find-partner-applications-query.dto';
import { PartnerApplicationEntity } from '../entities/partner-application.entity';
import { Roles } from '../../../common/decorators/roles.decorator';
import { JwtAuthGuard } from '../../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../../common/guards/roles.guard';
import { Public } from '../../../common/decorators/public.decorator';

@ApiTags('Partner Applications')
@Controller('partner-applications')
export class PartnerApplicationsController {
  constructor(private readonly partnerApplicationsService: PartnerApplicationsService) {}

  @Post()
  @Public()
  @ApiOperation({ summary: 'Soumettre une candidature partenaire (aucun compte requis)' })
  @ApiResponse({
    status: 201,
    description: 'La candidature a été soumise avec succès.',
    type: PartnerApplicationEntity,
  })
  create(@Body() createPartnerApplicationDto: CreatePartnerApplicationDto) {
    return this.partnerApplicationsService.create(createPartnerApplicationDto);
  }

  @Get()
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN)
  @ApiOperation({ summary: 'Récupérer toutes les candidatures partenaires (Admin seulement)' })
  @ApiQuery({ type: FindPartnerApplicationsQueryDto })
  @ApiResponse({ status: 200, description: 'Retourne les candidatures avec pagination.' })
  findAll(@Query() query: FindPartnerApplicationsQueryDto) {
    return this.partnerApplicationsService.findAll(query.page, query.limit, query.status);
  }

  @Get(':id')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN)
  @ApiOperation({ summary: 'Récupérer une candidature partenaire (Admin seulement)' })
  @ApiResponse({ status: 200, description: 'Retourne la candidature.', type: PartnerApplicationEntity })
  @ApiResponse({ status: 404, description: 'Candidature introuvable.' })
  findOne(@Param('id') id: string) {
    return this.partnerApplicationsService.findOne(id);
  }

  @Patch(':id')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN)
  @ApiOperation({ summary: 'Traiter une candidature partenaire : statut (Admin seulement)' })
  @ApiResponse({
    status: 200,
    description: 'La candidature a été mise à jour avec succès.',
    type: PartnerApplicationEntity,
  })
  @ApiResponse({ status: 404, description: 'Candidature introuvable.' })
  update(@Param('id') id: string, @Body() updatePartnerApplicationDto: UpdatePartnerApplicationDto) {
    return this.partnerApplicationsService.update(id, updatePartnerApplicationDto);
  }
}
