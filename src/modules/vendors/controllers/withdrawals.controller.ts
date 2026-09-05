import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
  Request,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiQuery,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { UserRole, WebUserRole, WithdrawalStatus } from '@prisma/client';
import { Roles } from '../../../common/decorators/roles.decorator';
import { WebRoles } from '../../../common/decorators/web-roles.decorator';
import { CombinedJwtAuthGuard } from '../../../common/guards/combined-jwt-auth.guard';
import { CombinedRolesGuard } from '../../../common/guards/combined-roles.guard';
import { CreateWithdrawalDto } from '../dto/create-withdrawal.dto';
import { WithdrawalsService } from '../services/withdrawals.service';

@ApiTags('Withdrawals')
@Controller('withdrawals')
@ApiBearerAuth()
@UseGuards(CombinedJwtAuthGuard, CombinedRolesGuard)
export class WithdrawalsController {
  constructor(private readonly withdrawalsService: WithdrawalsService) {}

  @Post('preview')
  @Roles(UserRole.VENDOR)
  @ApiOperation({
    summary: 'Récapitulatif de retrait (sans débit)',
    description:
      'Calcule frais FedaPay + cash Flooz/Mixx selon paliers 10k/30k. Afficher avant confirmation.',
  })
  preview(@Body() dto: CreateWithdrawalDto) {
    return this.withdrawalsService.preview(dto.amount, dto.operator as any);
  }

  @Post()
  @Roles(UserRole.VENDOR)
  @ApiOperation({
    summary: 'Demander un retrait (vendeur mobile)',
    description:
      'Bloqué si créance. Frais barèmes réels FedaPay / Flooz / Mixx. Payout FedaPay ensuite.',
  })
  @ApiResponse({ status: 201, description: 'Retrait créé en PENDING' })
  request(@Body() dto: CreateWithdrawalDto, @Request() req: any) {
    return this.withdrawalsService.request(dto, {
      id: req.user.id,
      role: req.user.role,
    });
  }

  @Get('me')
  @Roles(UserRole.VENDOR)
  @ApiOperation({ summary: 'Historique des retraits du vendeur connecté' })
  @ApiQuery({ name: 'page', required: false })
  @ApiQuery({ name: 'limit', required: false })
  findMine(
    @Request() req: any,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    return this.withdrawalsService.findMine(
      { id: req.user.id, role: req.user.role },
      page ? parseInt(page, 10) : 1,
      limit ? parseInt(limit, 10) : 10,
    );
  }

  @Get()
  @Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN)
  @WebRoles(WebUserRole.ADMIN, WebUserRole.SUPERVISION)
  @ApiOperation({ summary: 'Liste des retraits (Admin / Supervision)' })
  @ApiQuery({ name: 'page', required: false })
  @ApiQuery({ name: 'limit', required: false })
  @ApiQuery({ name: 'status', required: false, enum: WithdrawalStatus })
  findAll(
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Query('status') status?: WithdrawalStatus,
  ) {
    return this.withdrawalsService.findAll(
      page ? parseInt(page, 10) : 1,
      limit ? parseInt(limit, 10) : 10,
      status,
    );
  }

  @Patch(':id/status')
  @Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN)
  @WebRoles(WebUserRole.ADMIN)
  @ApiOperation({
    summary: 'Mettre à jour le statut d’un retrait',
    description: 'PROCESSING | COMPLETED | FAILED. FAILED recrédite le solde vendeur.',
  })
  updateStatus(
    @Param('id') id: string,
    @Body('status') status: WithdrawalStatus,
    @Request() req: any,
  ) {
    return this.withdrawalsService.updateStatus(id, status, {
      id: req.user.id,
      role: req.user.role,
      isAdmin: true,
    });
  }
}
