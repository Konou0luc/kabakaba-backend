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

/**
 * Toute la gestion des comptes WebUser (création, liste, suppression) est
 * réservée à la Supervision — c'est elle qui définit qui a accès à quelle
 * interface (Supervision ou Admin).
 */
@ApiTags('Web Users (gestion des comptes — Supervision)')
@ApiBearerAuth()
@UseGuards(WebJwtAuthGuard, WebRolesGuard)
@WebRoles(WebUserRole.SUPERVISION)
@Controller('web-auth/web-users')
export class WebUsersController {
  constructor(private readonly webUsersService: WebUsersService) {}

  @Get()
  @ApiOperation({ summary: 'Lister les comptes WebUser actifs (Supervision seulement)' })
  @ApiResponse({ status: 200, description: 'Retourne les comptes non supprimés.', type: [WebUserEntity] })
  findAll() {
    return this.webUsersService.findAll();
  }

  @Post()
  @ApiOperation({ summary: 'Créer un compte WebUser avec mot de passe temporaire (Supervision seulement)' })
  @ApiResponse({ status: 201, description: 'Compte créé, en attente de première connexion.', type: WebUserEntity })
  @ApiResponse({ status: 409, description: 'Email déjà utilisé.' })
  provision(@Body() dto: ProvisionWebUserDto) {
    return this.webUsersService.provision(dto);
  }

  @Get('deletion-requests')
  @ApiOperation({ summary: 'Lister les demandes de suppression en attente de confirmation' })
  @ApiResponse({ status: 200, description: 'Retourne les demandes PENDING.' })
  findPendingDeletionRequests() {
    return this.webUsersService.findPendingDeletionRequests();
  }

  @Post(':id/deletion-requests')
  @ApiOperation({
    summary:
      'Étape 1/2 : initier la suppression d\'un compte (le compte root est protégé, la confirmation devra venir d\'une autre personne)',
  })
  @ApiResponse({ status: 201, description: 'Demande de suppression créée, en attente de confirmation.' })
  @ApiResponse({ status: 403, description: 'Compte root, ou auto-suppression.' })
  @ApiResponse({ status: 409, description: 'Une demande est déjà en attente pour ce compte.' })
  initiateDeletion(
    @Param('id') id: string,
    @Body() dto: InitiateWebUserDeletionDto,
    @Request() req,
  ) {
    return this.webUsersService.initiateDeletion(id, req.user.id, dto.reason);
  }

  @Post('deletion-requests/:requestId/confirm')
  @ApiOperation({
    summary: 'Étape 2/2 : confirmer une suppression — doit être une personne différente de celle qui a initié',
  })
  @ApiResponse({ status: 200, description: 'Compte désactivé (soft delete).' })
  @ApiResponse({ status: 403, description: 'Le confirmateur est le même que l\'initiateur.' })
  @ApiResponse({ status: 409, description: 'Demande déjà traitée.' })
  confirmDeletion(@Param('requestId') requestId: string, @Request() req) {
    return this.webUsersService.confirmDeletion(requestId, req.user.id);
  }

  @Post('deletion-requests/:requestId/cancel')
  @ApiOperation({ summary: 'Annuler une demande de suppression en attente' })
  @ApiResponse({ status: 200, description: 'Demande annulée.' })
  @ApiResponse({ status: 409, description: 'Demande déjà traitée.' })
  cancelDeletion(@Param('requestId') requestId: string) {
    return this.webUsersService.cancelDeletion(requestId);
  }
}
