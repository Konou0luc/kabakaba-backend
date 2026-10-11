import { Body, Controller, Get, Param, Patch, Post, Query, Request, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiQuery, ApiResponse, ApiTags } from '@nestjs/swagger';
import { UserRole, WebUserRole } from '@prisma/client';
import { ReportsService } from '../services/reports.service';
import { CreateReportDto } from '../dto/create-report.dto';
import { UpdateReportDto } from '../dto/update-report.dto';
import { FindReportsQueryDto } from '../dto/find-reports-query.dto';
import { ReportEntity } from '../entities/report.entity';
import { Roles } from '../../../common/decorators/roles.decorator';
import { WebRoles } from '../../../common/decorators/web-roles.decorator';
import { CombinedJwtAuthGuard } from '../../../common/guards/combined-jwt-auth.guard';
import { CombinedRolesGuard } from '../../../common/guards/combined-roles.guard';

@ApiTags('Reports')
@Controller('reports')
export class ReportsController {
  constructor(private readonly reportsService: ReportsService) {}

  // Étudiant seulement : sans @WebRoles, un jeton web est refusé par CombinedRolesGuard.
  @Post()
  @ApiBearerAuth()
  @UseGuards(CombinedJwtAuthGuard, CombinedRolesGuard)
  @Roles(UserRole.STUDENT)
  @ApiOperation({ summary: 'Signaler un problème sur une de mes commandes (prête ou récupérée)' })
  @ApiResponse({ status: 201, description: 'Le signalement a été créé avec succès.', type: ReportEntity })
  @ApiResponse({ status: 400, description: 'Commande ni prête ni récupérée, ou commentaire manquant pour le type OTHER.' })
  @ApiResponse({ status: 403, description: 'Cette commande n\'est pas la vôtre.' })
  @ApiResponse({ status: 404, description: 'Commande introuvable.' })
  @ApiResponse({ status: 409, description: 'Un signalement est déjà en cours de traitement pour cette commande.' })
  create(@Body() createReportDto: CreateReportDto, @Request() req) {
    return this.reportsService.create(createReportDto, req.user.id);
  }

  @Get()
  @ApiBearerAuth()
  @UseGuards(CombinedJwtAuthGuard, CombinedRolesGuard)
  @Roles(UserRole.STUDENT)
  @WebRoles(WebUserRole.SUPERVISION, WebUserRole.ADMIN)
  @ApiOperation({ summary: 'Récupérer les signalements (un étudiant ne voit que les siens)' })
  @ApiQuery({ type: FindReportsQueryDto })
  @ApiResponse({ status: 200, description: 'Retourne les signalements avec pagination.' })
  findAll(@Query() query: FindReportsQueryDto, @Request() req) {
    const isWebUser = req.user.__authKind === 'web';

    // Un étudiant ne voit que ses signalements, même s'il envoie un autre studentId.
    const studentId = isWebUser ? query.studentId : req.user.id;
    const vendorId = isWebUser ? query.vendorId : undefined;
    const campusId = isWebUser ? query.campusId : undefined;

    return this.reportsService.findAll(
      query.page,
      query.limit,
      query.status,
      query.type,
      vendorId,
      studentId,
      query.orderId,
      campusId,
      query.days,
      query.from,
      query.to,
    );
  }

  // Réservé au web : @Roles() sans rôle ferme la route à tout jeton mobile
  // (sans @Roles, CombinedRolesGuard laisserait passer n'importe quel jeton mobile).
  @Get('stats')
  @ApiBearerAuth()
  @UseGuards(CombinedJwtAuthGuard, CombinedRolesGuard)
  @Roles()
  @WebRoles(WebUserRole.SUPERVISION, WebUserRole.ADMIN)
  @ApiOperation({ summary: 'KPIs de la page Signalements (dashboard admin web)' })
  @ApiResponse({ status: 200, description: 'Statistiques agrégées.' })
  getStats() {
    return this.reportsService.getStats();
  }

  @Get(':id')
  @ApiBearerAuth()
  @UseGuards(CombinedJwtAuthGuard, CombinedRolesGuard)
  @Roles(UserRole.STUDENT)
  @WebRoles(WebUserRole.SUPERVISION, WebUserRole.ADMIN)
  @ApiOperation({ summary: 'Récupérer un signalement (propriétaire ou web)' })
  @ApiResponse({ status: 200, description: 'Retourne le signalement.', type: ReportEntity })
  @ApiResponse({ status: 404, description: 'Signalement introuvable.' })
  findOne(@Param('id') id: string, @Request() req) {
    return this.reportsService.findOne(id, { id: req.user.id, kind: req.user.__authKind, role: req.user.role });
  }

  // Réservé au web admin : @Roles() sans rôle ferme la route à tout jeton mobile.
  @Patch(':id')
  @ApiBearerAuth()
  @UseGuards(CombinedJwtAuthGuard, CombinedRolesGuard)
  @Roles()
  @WebRoles(WebUserRole.ADMIN)
  @ApiOperation({ summary: 'Changer le statut d\'un signalement (web admin seulement)' })
  @ApiResponse({ status: 200, description: 'Le signalement a été mis à jour avec succès.', type: ReportEntity })
  @ApiResponse({ status: 404, description: 'Signalement introuvable.' })
  update(@Param('id') id: string, @Body() updateReportDto: UpdateReportDto) {
    return this.reportsService.update(id, updateReportDto);
  }
}
