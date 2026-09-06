import { Body, Controller, Get, Param, Post, Request, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { WebUserRole } from '@prisma/client';
import { WebUsersService } from '../services/web-users.service';
import { ProvisionWebUserDto } from '../dto/provision-web-user.dto';
import { InitiateWebUserDeletionDto } from '../dto/initiate-web-user-deletion.dto';
import { WebUserEntity } from '../entities/web-user.entity';
import { WebJwtAuthGuard } from '../../../common/guards/web-jwt-auth.guard';
import { WebRolesGuard } from '../../../common/guards/web-roles.guard';
import { WebRoles } from '../../../common/decorators/web-roles.decorator';

@ApiTags('Web Users (gestion des comptes — Supervision)')
@ApiBearerAuth()
@UseGuards(WebJwtAuthGuard, WebRolesGuard)
@WebRoles(WebUserRole.SUPERVISION)
@Controller('web-auth/web-users')
export class WebUsersController {
  constructor(private readonly webUsersService: WebUsersService) {}

  @Get()
  @ApiOperation({ summary: 'Lister tous les comptes WebUser, y compris désactivés (Supervision seulement)' })
  @ApiResponse({ status: 200, description: 'Retourne tous les comptes, actifs en tête.', type: [WebUserEntity] })
  findAll() {
    return this.webUsersService.findAll();
  }

  @Post()
  @ApiOperation({ summary: 'Créer un compte WebUser avec mot de passe temporaire (Supervision seulement)' })
  @ApiResponse({ status: 201, description: 'Compte créé, inactif jusqu\'à la première connexion.', type: WebUserEntity })
  @ApiResponse({ status: 409, description: 'Email déjà utilisé.' })
  provision(@Body() dto: ProvisionWebUserDto) {
    return this.webUsersService.provision(dto);
  }

  @Get('deletion-requests')
  @ApiOperation({ summary: 'Lister les demandes de suppression en attente de vote' })
  @ApiResponse({ status: 200, description: 'Retourne les demandes PENDING (cible Supervision uniquement).' })
  findPendingDeletionRequests() {
    return this.webUsersService.findPendingDeletionRequests();
  }

  @Get('deletion-requests/:requestId')
  @ApiOperation({ summary: "Voir la progression d'une demande (votes/majorité)" })
  @ApiResponse({ status: 200, description: 'Détail de la demande avec compte de votes.' })
  getDeletionRequestProgress(@Param('requestId') requestId: string) {
    return this.webUsersService.getDeletionRequestProgress(requestId);
  }

  @Post(':id/deletion-requests')
  @ApiOperation({
    summary:
      'Initier la suppression d\'un compte — exécution immédiate si la cible est ADMIN, vote à la majorité (48h) si la cible est SUPERVISION',
  })
  @ApiResponse({ status: 201, description: 'Suppression exécutée (ADMIN) ou demande créée (SUPERVISION).' })
  @ApiResponse({ status: 403, description: 'Compte root, ou auto-suppression.' })
  @ApiResponse({ status: 409, description: 'Une demande est déjà en attente pour ce compte.' })
  initiateDeletion(@Param('id') id: string, @Body() dto: InitiateWebUserDeletionDto, @Request() req) {
    return this.webUsersService.initiateDeletion(id, req.user.id, dto.reason);
  }

  @Post('deletion-requests/:requestId/confirm')
  @ApiOperation({ summary: 'Voter "pour" la suppression d\'un compte Supervision' })
  @ApiResponse({ status: 200, description: 'Vote enregistré, ou compte désactivé si la majorité est atteinte.' })
  @ApiResponse({ status: 403, description: 'Vote sur son propre compte.' })
  @ApiResponse({ status: 409, description: 'Déjà voté, demande déjà traitée, ou expirée.' })
  confirmDeletion(@Param('requestId') requestId: string, @Request() req) {
    return this.webUsersService.approveDeletion(requestId, req.user.id);
  }

  @Post('deletion-requests/:requestId/cancel')
  @ApiOperation({ summary: 'Annuler une demande de suppression en attente' })
  @ApiResponse({ status: 200, description: 'Demande annulée.' })
  @ApiResponse({ status: 409, description: 'Demande déjà traitée.' })
  cancelDeletion(@Param('requestId') requestId: string, @Request() req) {
    return this.webUsersService.cancelDeletion(requestId, req.user.id);
  }
}