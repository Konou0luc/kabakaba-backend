import { Body, Controller, Get, Param, Post, Request, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { WebUserRole } from '@prisma/client';
import { PayrollService } from '../services/payroll.service';
import { SetPayoutPercentageDto } from '../dto/set-payout-percentage.dto';
import { SetPayrollScheduleDto } from '../dto/set-payroll-schedule.dto';
import { WebJwtAuthGuard } from '../../../common/guards/web-jwt-auth.guard';
import { WebRolesGuard } from '../../../common/guards/web-roles.guard';
import { WebRoles } from '../../../common/decorators/web-roles.decorator';

@ApiTags('Payroll (Supervision)')
@ApiBearerAuth()
@UseGuards(WebJwtAuthGuard, WebRolesGuard)
@WebRoles(WebUserRole.SUPERVISION)
@Controller('payroll')
export class PayrollController {
  constructor(private readonly payrollService: PayrollService) {}

  @Get('config')
  @ApiOperation({ summary: 'Voir la configuration de paie (pourcentages, soldes, planification)' })
  @ApiResponse({ status: 200, description: 'Configuration actuelle.' })
  getConfig() {
    return this.payrollService.listPayoutConfig();
  }

  @Post('accounts/:webUserId/percentage')
  @ApiOperation({ summary: "Définir le pourcentage d'un compte (somme ≤ 100%)" })
  @ApiResponse({ status: 200, description: 'Pourcentage mis à jour.' })
  @ApiResponse({ status: 400, description: 'La somme dépasserait 100%.' })
  setPercentage(@Param('webUserId') webUserId: string, @Body() dto: SetPayoutPercentageDto) {
    return this.payrollService.setPayoutPercentage(webUserId, dto.percentage);
  }

  @Post('schedule')
  @ApiOperation({ summary: 'Activer/désactiver et configurer la paie automatique mensuelle' })
  @ApiResponse({ status: 200, description: 'Planification mise à jour.' })
  setSchedule(@Body() dto: SetPayrollScheduleDto) {
    return this.payrollService.setSchedule(dto.isEnabled, dto.dayOfMonth);
  }

  @Post('run')
  @ApiOperation({ summary: 'Déclencher manuellement la paie du mois précédent complet' })
  @ApiResponse({ status: 201, description: 'Paie exécutée, soldes crédités.' })
  runManually(@Request() req) {
    return this.payrollService.runPayroll(req.user.id, 'MANUAL');
  }

  @Get('runs')
  @ApiOperation({ summary: "Historique des paies déjà exécutées" })
  @ApiResponse({ status: 200, description: 'Liste des runs, avec détail par compte.' })
  listRuns() {
    return this.payrollService.listRuns();
  }
}