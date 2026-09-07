import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
  Request,
  Res,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiBody,
  ApiConsumes,
  ApiOperation,
  ApiQuery,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { UserRole, WebUserRole, WithdrawalStatus } from '@prisma/client';
import type { Response } from 'express';
import { FileInterceptor } from '@nestjs/platform-express';
import { Roles } from '../../../common/decorators/roles.decorator';
import { WebRoles } from '../../../common/decorators/web-roles.decorator';
import { CombinedJwtAuthGuard } from '../../../common/guards/combined-jwt-auth.guard';
import { CombinedRolesGuard } from '../../../common/guards/combined-roles.guard';
import { CreateWithdrawalDto } from '../dto/create-withdrawal.dto';
import { CreateWithdrawalAppealDto, WithdrawalReasonDto, ResolveWithdrawalAppealDto } from '../dto/withdrawal-action.dto';
import { WithdrawalsService } from '../services/withdrawals.service';

@ApiTags('Withdrawals')
@Controller('withdrawals')
@ApiBearerAuth()
@UseGuards(CombinedJwtAuthGuard, CombinedRolesGuard)
export class WithdrawalsController {
  constructor(private readonly withdrawalsService: WithdrawalsService) {}

  @Post('preview')
  @Roles(UserRole.VENDOR)
  @ApiOperation({ summary: 'Récapitulatif de retrait (sans débit)' })
  preview(@Body() dto: CreateWithdrawalDto) {
    return this.withdrawalsService.preview(dto.amount, dto.operator as any);
  }

  @Post()
  @Roles(UserRole.VENDOR)
  @ApiOperation({
    summary: 'Demander un retrait (vendeur mobile)',
    description: 'Le solde est débité immédiatement selon le barème. Le transfert est ensuite effectué manuellement par un administrateur Web.',
  })
  @ApiResponse({ status: 201, description: 'Retrait créé en attente de traitement manuel' })
  request(@Body() dto: CreateWithdrawalDto, @Request() req: any) {
    return this.withdrawalsService.request(dto, {
      id: req.user.id,
      role: req.user.role,
      kind: req.user.__authKind === 'web' ? 'web' : 'mobile',
    });
  }

  @Get('me')
  @Roles(UserRole.VENDOR)
  @ApiOperation({ summary: 'Historique des retraits du vendeur connecté' })
  @ApiQuery({ name: 'page', required: false })
  @ApiQuery({ name: 'limit', required: false })
  findMine(@Request() req: any, @Query('page') page?: string, @Query('limit') limit?: string) {
    return this.withdrawalsService.findMine(
      { id: req.user.id, role: req.user.role },
      page ? parseInt(page, 10) : 1,
      limit ? parseInt(limit, 10) : 10,
    );
  }

  @Get('stats')
  @Roles(UserRole.ADMIN)
  @WebRoles(WebUserRole.ADMIN, WebUserRole.SUPERVISION)
  @ApiOperation({ summary: 'Statistiques des retraits' })
  getStats() { return this.withdrawalsService.getStats(); }

  @Get()
  @Roles(UserRole.ADMIN)
  @WebRoles(WebUserRole.ADMIN, WebUserRole.SUPERVISION)
  @ApiOperation({ summary: 'Liste des retraits pour le dashboard Web' })
  @ApiQuery({ name: 'page', required: false })
  @ApiQuery({ name: 'limit', required: false })
  @ApiQuery({ name: 'status', required: false, enum: WithdrawalStatus })
  @ApiQuery({ name: 'from', required: false })
  @ApiQuery({ name: 'to', required: false })
  findAll(
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Query('status') status?: WithdrawalStatus,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    return this.withdrawalsService.findAll(page ? parseInt(page, 10) : 1, limit ? parseInt(limit, 10) : 10, status, from, to);
  }

  @Get(':id')
  @Roles(UserRole.ADMIN)
  @WebRoles(WebUserRole.ADMIN, WebUserRole.SUPERVISION)
  @ApiOperation({ summary: 'Détail d’un retrait avec montant brut/net, opérateur, preuve et contestations' })
  findOne(@Param('id') id: string) { return this.withdrawalsService.findOneAdmin(id); }

  @Patch(':id/accept')
  @Roles(UserRole.ADMIN)
  @WebRoles(WebUserRole.ADMIN)
  @ApiOperation({ summary: 'Accepter une demande et la placer en traitement manuel' })
  accept(@Param('id') id: string, @Request() req: any) {
    return this.withdrawalsService.accept(id, { id: req.user.id, role: req.user.role, kind: 'web' });
  }

  @Post(':id/proof')
  @Roles(UserRole.ADMIN)
  @WebRoles(WebUserRole.ADMIN)
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: 5 * 1024 * 1024 } }))
  @ApiConsumes('multipart/form-data')
  @ApiBody({ schema: { type: 'object', properties: { file: { type: 'string', format: 'binary' } }, required: ['file'] } })
  @ApiOperation({ summary: 'Uploader la photo de la facture / preuve USSD' })
  uploadProof(@Param('id') id: string, @UploadedFile() file: { buffer: Buffer; size: number; originalname?: string }, @Request() req: any) {
    return this.withdrawalsService.uploadProof(id, file, { id: req.user.id, role: req.user.role, kind: 'web' });
  }

  @Get(':id/proof')
  @Roles(UserRole.ADMIN)
  @WebRoles(WebUserRole.ADMIN, WebUserRole.SUPERVISION)
  @ApiOperation({ summary: 'Consulter la preuve de transaction d’un retrait' })
  async getProof(@Param('id') id: string, @Request() req: any, @Res() res: Response) {
    const proof = await this.withdrawalsService.getProof(id, { id: req.user.id, role: req.user.role, kind: 'web' });
    res.setHeader('Content-Type', proof.contentType);
    res.setHeader('Content-Length', proof.sizeBytes);
    res.setHeader('Content-Disposition', `inline; filename="proof-${id}.${proof.contentType.split('/')[1]}"`);
    res.setHeader('Cache-Control', 'private, no-store');
    res.send(proof.data);
  }

  @Post(':id/confirm')
  @Roles(UserRole.ADMIN)
  @WebRoles(WebUserRole.ADMIN)
  @ApiOperation({ summary: 'Valider le transfert manuel après dépôt de la preuve' })
  confirm(@Param('id') id: string, @Request() req: any) {
    return this.withdrawalsService.confirmManualPayment(id, { id: req.user.id, role: req.user.role, kind: 'web' });
  }

  @Post(':id/fail')
  @Roles(UserRole.ADMIN)
  @WebRoles(WebUserRole.ADMIN)
  @ApiOperation({ summary: 'Déclarer un transfert manuel non abouti et recréditer le vendeur' })
  fail(@Param('id') id: string, @Body() dto: WithdrawalReasonDto, @Request() req: any) {
    return this.withdrawalsService.fail(id, dto.reason, { id: req.user.id, role: req.user.role, kind: 'web' });
  }

  @Post(':id/cancel')
  @Roles(UserRole.ADMIN)
  @WebRoles(WebUserRole.ADMIN)
  @ApiOperation({ summary: 'Annuler une demande et recréditer le vendeur' })
  cancel(@Param('id') id: string, @Body() dto: WithdrawalReasonDto, @Request() req: any) {
    return this.withdrawalsService.cancel(id, dto.reason, { id: req.user.id, role: req.user.role, kind: 'web' });
  }

  @Post(':id/appeal')
  @Roles(UserRole.VENDOR)
  @ApiOperation({ summary: 'Signaler un retrait non reçu ou un montant incorrect dans l’heure suivant le paiement' })
  createAppeal(@Param('id') id: string, @Body() dto: CreateWithdrawalAppealDto, @Request() req: any) {
    return this.withdrawalsService.createAppeal(id, dto, { id: req.user.id, role: req.user.role, kind: 'mobile' });
  }

  @Patch('appeals/:appealId/resolve')
  @Roles(UserRole.ADMIN)
  @WebRoles(WebUserRole.ADMIN)
  @ApiOperation({ summary: 'Traiter une contestation de retrait après vérification' })
  resolveAppeal(@Param('appealId') appealId: string, @Body() dto: ResolveWithdrawalAppealDto, @Query('approved') approved = 'false', @Request() req: any) {
    return this.withdrawalsService.resolveAppeal(
      appealId,
      dto.resolutionNote,
      approved === 'true',
      { id: req.user.id, role: req.user.role, kind: 'web' },
    );
  }
}
