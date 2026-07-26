import { Body, Controller, Get, Param, Post, Request, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { WebUserRole } from '@prisma/client';
import { WithdrawalsService } from '../services/withdrawals.service';
import { RequestWithdrawalDto, RejectWithdrawalDto } from '../dto/request-withdrawal.dto';
import { WebJwtAuthGuard } from '../../../common/guards/web-jwt-auth.guard';
import { WebRolesGuard } from '../../../common/guards/web-roles.guard';
import { WebRoles } from '../../../common/decorators/web-roles.decorator';

@ApiTags('Withdrawals (paie employés)')
@ApiBearerAuth()
@Controller('payroll/withdrawals')
export class WithdrawalsController {
  constructor(private readonly withdrawalsService: WithdrawalsService) {}

  @Post()
  @UseGuards(WebJwtAuthGuard)
  @ApiOperation({ summary: "Demander un retrait sur son propre solde (tout compte WebUser)" })
  @ApiResponse({ status: 201, description: 'Demande créée, solde débité en attente de validation.' })
  @ApiResponse({ status: 400, description: 'Solde insuffisant.' })
  request(@Request() req, @Body() dto: RequestWithdrawalDto) {
    return this.withdrawalsService.request(req.user.id, dto.amount, dto.payoutNumber);
  }

  @Get('mine')
  @UseGuards(WebJwtAuthGuard)
  @ApiOperation({ summary: 'Voir ses propres demandes de retrait' })
  @ApiResponse({ status: 200, description: 'Liste des demandes de cet utilisateur.' })
  listOwn(@Request() req) {
    return this.withdrawalsService.listOwn(req.user.id);
  }

  @Get()
  @UseGuards(WebJwtAuthGuard, WebRolesGuard)
  @WebRoles(WebUserRole.SUPERVISION)
  @ApiOperation({ summary: 'Voir toutes les demandes de retrait (Supervision seulement)' })
  @ApiResponse({ status: 200, description: 'Toutes les demandes.' })
  listAll() {
    return this.withdrawalsService.listAll();
  }

  @Post(':id/approve')
  @UseGuards(WebJwtAuthGuard, WebRolesGuard)
  @WebRoles(WebUserRole.SUPERVISION)
  @ApiOperation({ summary: 'Valider une demande — déclenche le payout FedaPay réel' })
  @ApiResponse({ status: 200, description: 'Payout FedaPay créé et envoyé.' })
  approve(@Param('id') id: string, @Request() req) {
    return this.withdrawalsService.approve(id, req.user.id);
  }

  @Post(':id/reject')
  @UseGuards(WebJwtAuthGuard, WebRolesGuard)
  @WebRoles(WebUserRole.SUPERVISION)
  @ApiOperation({ summary: 'Rejeter une demande — rembourse le solde' })
  @ApiResponse({ status: 200, description: 'Demande rejetée, solde recrédité.' })
  reject(@Param('id') id: string, @Body() dto: RejectWithdrawalDto, @Request() req) {
    return this.withdrawalsService.reject(id, req.user.id, dto.reason);
  }
}