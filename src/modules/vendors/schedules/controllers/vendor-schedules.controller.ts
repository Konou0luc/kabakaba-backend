import { Body, Controller, Delete, Get, Param, Post, Request, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { UserRole, WebUserRole } from '@prisma/client';
import { VendorSchedulesService } from '../services/vendor-schedules.service';
import { CreateVendorScheduleDto } from '../dto/create-vendor-schedule.dto';
import { Roles } from '../../../../common/decorators/roles.decorator';
import { WebRoles } from '../../../../common/decorators/web-roles.decorator';
import { CombinedJwtAuthGuard } from '../../../../common/guards/combined-jwt-auth.guard';
import { CombinedRolesGuard } from '../../../../common/guards/combined-roles.guard';

// Horaires typiques d'ouverture affichés à titre indicatif aux étudiants
// (l'ouverture réelle jour par jour reste pilotée par le vendeur depuis
// l'app mobile via Vendor.isOpen — cf. CantineFiche.jsx, onglet Infos).
@ApiTags('Vendor Schedules')
@Controller('vendors/:vendorId/schedules')
export class VendorSchedulesController {
  constructor(private readonly vendorSchedulesService: VendorSchedulesService) {}

  @Get()
  @ApiBearerAuth()
  @UseGuards(CombinedJwtAuthGuard, CombinedRolesGuard)
  @Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN, UserRole.VENDOR)
  @WebRoles(WebUserRole.ADMIN, WebUserRole.SUPERVISION)
  @ApiOperation({ summary: 'Lister les plages horaires typiques d\'une cantine' })
  @ApiResponse({ status: 200, description: 'Liste des plages horaires.' })
  findAll(@Param('vendorId') vendorId: string, @Request() req) {
    return this.vendorSchedulesService.findAll(vendorId, { id: req.user.id, role: req.user.role });
  }

  @Post()
  @ApiBearerAuth()
  @UseGuards(CombinedJwtAuthGuard, CombinedRolesGuard)
  @Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN, UserRole.VENDOR)
  @WebRoles(WebUserRole.ADMIN)
  @ApiOperation({ summary: 'Ajouter une plage horaire (Admin ou Vendeur)' })
  @ApiResponse({ status: 201, description: 'La plage horaire a été créée.' })
  create(@Param('vendorId') vendorId: string, @Body() dto: CreateVendorScheduleDto, @Request() req) {
    return this.vendorSchedulesService.create(vendorId, dto, { id: req.user.id, role: req.user.role });
  }

  @Delete(':id')
  @ApiBearerAuth()
  @UseGuards(CombinedJwtAuthGuard, CombinedRolesGuard)
  @Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN, UserRole.VENDOR)
  @WebRoles(WebUserRole.ADMIN)
  @ApiOperation({ summary: 'Supprimer une plage horaire (Admin ou Vendeur)' })
  @ApiResponse({ status: 200, description: 'La plage horaire a été supprimée.' })
  remove(@Param('vendorId') vendorId: string, @Param('id') id: string, @Request() req) {
    return this.vendorSchedulesService.remove(vendorId, id, { id: req.user.id, role: req.user.role });
  }
}
