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

  // Création réservée à l'étudiant (aucun @WebRoles : un token web est refusé).
  @Post()
  @ApiBearerAuth()
  @UseGuards(CombinedJwtAuthGuard, CombinedRolesGuard)
  @Roles(UserRole.STUDENT)
  @ApiOperation({ summary: 'Signaler un problème sur sa commande prête ou récupérée (étudiant)' })
  @ApiResponse({ status: 201, description: 'Le signalement a été créé.', type: ReportEntity })
  @ApiResponse({ status: 400, description: "Commande ni prête ni récupérée, ou commentaire manquant pour le type OTHER." })
  @ApiResponse({ status: 403, description: "Cette commande n'est pas la vôtre." })
  @ApiResponse({ status: 404, description: 'Commande introuvable.' })
  @ApiResponse({ status: 409, description: 'Un signalement est déjà en cours pour cette commande.' })
  create(@Body() createReportDto: CreateReportDto, @Request() req) {
    return this.reportsService.create(createReportDto, req.user.id);
  }

  @Get()
  @ApiBearerAuth()
  @UseGuards(CombinedJwtAuthGuard, CombinedRolesGuard)
  @Roles(UserRole.STUDENT)
  @WebRoles(WebUserRole.SUPERVISION, WebUserRole.ADMIN)
  @ApiOperation({ summary: "Lister les signalements (l'étudiant voit les siens ; l'administration web voit tous, filtrables par statut et type)" })
  @ApiQuery({ type: FindReportsQueryDto })
  @ApiResponse({ status: 200, description: 'Retourne les signalements avec pagination.' })
  findAll(@Query() query: FindReportsQueryDto, @Request() req) {
    // Un token mobile n'atteint cette route qu'en tant qu'étudiant : il ne voit que ses signalements.
    const studentId = req.user.__authKind === 'web' ? query.studentId : req.user.id;
    return this.reportsService.findAll(query, studentId);
  }

  @Get('stats')
  @ApiBearerAuth()
  @UseGuards(CombinedJwtAuthGuard, CombinedRolesGuard)
  @Roles(UserRole.ADMIN)
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
  @ApiOperation({
    summary: 'Récupérer un signalement (son propriétaire ou l\'administration web)',
    description:
      "Pour l'administration web (administration et supervision), la commande liée contient aussi ses lignes (nom, quantité, prix unitaire, menu ou composant). L'étudiant propriétaire reçoit le signalement seul.",
  })
  @ApiResponse({ status: 200, description: 'Retourne le signalement.', type: ReportEntity })
  @ApiResponse({ status: 403, description: "Ce signalement n'est pas le vôtre." })
  @ApiResponse({ status: 404, description: 'Signalement introuvable.' })
  findOne(@Param('id') id: string, @Request() req) {
    return this.reportsService.findOne(id, { id: req.user.id, kind: req.user.__authKind, role: req.user.role });
  }

  @Patch(':id')
  @ApiBearerAuth()
  @UseGuards(CombinedJwtAuthGuard, CombinedRolesGuard)
  @Roles(UserRole.ADMIN)
  @WebRoles(WebUserRole.ADMIN)
  @ApiOperation({
    summary: "Changer le statut d'un signalement (Admin seulement)",
    description:
      "Quand l'administration web passe le signalement à IN_PROGRESS ou RESOLVED, l'administrateur connecté (lu dans le jeton) est enregistré comme celui qui le traite. Le corps ne contient que le statut : tout autre champ est refusé (400).",
  })
  @ApiResponse({ status: 200, description: 'Le signalement a été mis à jour.', type: ReportEntity })
  @ApiResponse({ status: 400, description: 'Corps invalide (statut inconnu ou champ non autorisé).' })
  @ApiResponse({ status: 404, description: 'Signalement introuvable.' })
  update(@Param('id') id: string, @Body() updateReportDto: UpdateReportDto, @Request() req) {
    // Même convention que partner-applications : l'identité vient du jeton web, jamais du corps.
    const treatedByWebUserId = req.user.__authKind === 'web' ? req.user.id : undefined;
    return this.reportsService.update(id, updateReportDto, treatedByWebUserId);
  }
}
