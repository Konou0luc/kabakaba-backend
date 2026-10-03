import { Controller, Get, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth } from '@nestjs/swagger';
import { AdminService } from '../services/admin.service';
import { Roles } from '../../../common/decorators/roles.decorator';
import { WebRoles } from '../../../common/decorators/web-roles.decorator';
import { UserRole, WebUserRole } from '@prisma/client';
import { CombinedJwtAuthGuard } from '../../../common/guards/combined-jwt-auth.guard';
import { CombinedRolesGuard } from '../../../common/guards/combined-roles.guard';

@ApiTags('Admin & Supervision')
@Controller('admin')
export class AdminController {
  constructor(private readonly adminService: AdminService) {}

  @Get('stats')
  @ApiBearerAuth()
  @UseGuards(CombinedJwtAuthGuard, CombinedRolesGuard)
  @Roles(UserRole.ADMIN)
  @WebRoles(WebUserRole.SUPERVISION, WebUserRole.ADMIN)
  @ApiOperation({ summary: 'Obtenir les statistiques du tableau de bord de supervision (Admin/dashboard web)' })
  @ApiResponse({
    status: 200,
    description: 'Retourne les statistiques de supervision',
  })
  getSupervisionStats() {
    return this.adminService.getSupervisionStats();
  }

  @Get('events/today')
  @ApiBearerAuth()
  @UseGuards(CombinedJwtAuthGuard, CombinedRolesGuard)
  @Roles(UserRole.ADMIN)
  @WebRoles(WebUserRole.SUPERVISION, WebUserRole.ADMIN)
  @ApiOperation({ summary: "Événements système survenus aujourd'hui (centre de notifications)" })
  @ApiResponse({
    status: 200,
    description: "Liste des événements du jour, réinitialisée chaque jour à minuit",
  })
  getTodayEvents() {
    return this.adminService.getTodayEvents();
  }
}
