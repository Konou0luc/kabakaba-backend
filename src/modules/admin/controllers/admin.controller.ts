import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiQuery,
} from '@nestjs/swagger';
import { AdminService } from '../services/admin.service';
import { CreateAuditLogDto } from '../dto/create-audit-log.dto';
import { AuditLogEntity } from '../entities/audit-log.entity';
import { PaginationDto } from '../../../common/dto/pagination.dto';
import { Roles } from '../../../common/decorators/roles.decorator';
import { WebRoles } from '../../../common/decorators/web-roles.decorator';
import { UserRole, WebUserRole } from '@prisma/client';
import { JwtAuthGuard } from '../../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../../common/guards/roles.guard';
import { CombinedJwtAuthGuard } from '../../../common/guards/combined-jwt-auth.guard';
import { CombinedRolesGuard } from '../../../common/guards/combined-roles.guard';

@ApiTags('Admin & Supervision')
@Controller('admin')
export class AdminController {
  constructor(private readonly adminService: AdminService) {}

  @Get('stats')
  @ApiBearerAuth()
  @UseGuards(CombinedJwtAuthGuard, CombinedRolesGuard)
  @Roles(UserRole.SUPER_ADMIN, UserRole.ADMIN)
  @WebRoles(WebUserRole.SUPERVISION, WebUserRole.ADMIN)
  @ApiOperation({ summary: 'Obtenir les statistiques du tableau de bord de supervision (Admin/dashboard web)' })
  @ApiResponse({
    status: 200,
    description: 'Retourne les statistiques de supervision',
  })
  getSupervisionStats() {
    return this.adminService.getSupervisionStats();
  }

  @Post('audit-logs')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.SUPER_ADMIN, UserRole.ADMIN)
  @ApiOperation({ summary: 'Créer un nouveau journal d\'audit (Admin seulement)' })
  @ApiResponse({
    status: 201,
    description: 'Journal d\'audit créé avec succès',
    type: AuditLogEntity,
  })
  createAuditLog(@Body() createAuditLogDto: CreateAuditLogDto) {
    return this.adminService.createAuditLog(createAuditLogDto);
  }

  @Get('audit-logs')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.SUPER_ADMIN, UserRole.ADMIN)
  @ApiOperation({ summary: 'Obtenir tous les journaux d\'audit (Admin seulement)' })
  @ApiQuery({ type: PaginationDto })
  @ApiResponse({
    status: 200,
    description: 'Retourne tous les journaux d\'audit avec pagination',
  })
  findAllAuditLogs(@Query() paginationDto: PaginationDto) {
    return this.adminService.findAllAuditLogs(
      paginationDto.page,
      paginationDto.limit,
    );
  }

  @Get('audit-logs/:id')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.SUPER_ADMIN, UserRole.ADMIN)
  @ApiOperation({ summary: 'Obtenir un journal d\'audit (Admin seulement)' })
  @ApiResponse({
    status: 200,
    description: 'Retourne le journal d\'audit',
    type: AuditLogEntity,
  })
  findOneAuditLog(@Param('id') id: string) {
    return this.adminService.findOneAuditLog(id);
  }
}