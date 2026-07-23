import { Body, Controller, Get, Param, Patch, Post, Query, Request, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiQuery, ApiResponse, ApiTags } from '@nestjs/swagger';
import { UserRole, WebUserRole } from '@prisma/client';
import { DisputesService } from '../services/disputes.service';
import { CreateDisputeDto } from '../dto/create-dispute.dto';
import { UpdateDisputeDto } from '../dto/update-dispute.dto';
import { FindDisputesQueryDto } from '../dto/find-disputes-query.dto';
import { DisputeEntity } from '../entities/dispute.entity';
import { Roles } from '../../../common/decorators/roles.decorator';
import { WebRoles } from '../../../common/decorators/web-roles.decorator';
import { JwtAuthGuard } from '../../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../../common/guards/roles.guard';
import { CombinedJwtAuthGuard } from '../../../common/guards/combined-jwt-auth.guard';
import { CombinedRolesGuard } from '../../../common/guards/combined-roles.guard';

@ApiTags('Disputes')
@Controller('disputes')
export class DisputesController {
  constructor(private readonly disputesService: DisputesService) {}

  @Post()
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.STUDENT, UserRole.VENDOR, UserRole.ADMIN, UserRole.SUPER_ADMIN)
  @ApiOperation({ summary: 'Ouvrir un litige sur une commande' })
  @ApiResponse({ status: 201, description: 'Le litige a été créé avec succès.', type: DisputeEntity })
  @ApiResponse({ status: 403, description: 'Vous n\'êtes pas partie à cette commande.' })
  @ApiResponse({ status: 404, description: 'Commande introuvable.' })
  create(@Body() createDisputeDto: CreateDisputeDto, @Request() req) {
    return this.disputesService.create(createDisputeDto, req.user.id, req.user.role);
  }

  @Get()
  @ApiBearerAuth()
  @UseGuards(CombinedJwtAuthGuard, CombinedRolesGuard)
  @Roles(UserRole.STUDENT, UserRole.VENDOR, UserRole.ADMIN, UserRole.SUPER_ADMIN)
  @WebRoles(WebUserRole.SUPERVISION, WebUserRole.ADMIN)
  @ApiOperation({ summary: 'Récupérer les litiges (filtrés par rôle)' })
  @ApiQuery({ type: FindDisputesQueryDto })
  @ApiResponse({ status: 200, description: 'Retourne les litiges avec pagination.' })
  async findAll(@Query() query: FindDisputesQueryDto, @Request() req) {
    const isMobileAdmin = req.user.role === UserRole.ADMIN || req.user.role === UserRole.SUPER_ADMIN;
    const isWebUser = req.user.__authKind === 'web';

    let studentId = isMobileAdmin || isWebUser ? query.studentId : undefined;
    let vendorId = isMobileAdmin || isWebUser ? query.vendorId : undefined;

    if (req.user.role === UserRole.STUDENT) studentId = req.user.id;
    if (req.user.role === UserRole.VENDOR) {
      const vendor = await this.disputesService.findVendorIdByUserId(req.user.id);
      vendorId = vendor ?? '__none__';
    }

    return this.disputesService.findAll(query.page, query.limit, query.status, vendorId, studentId, query.orderId);
  }

  @Get(':id')
  @ApiBearerAuth()
  @UseGuards(CombinedJwtAuthGuard, CombinedRolesGuard)
  @Roles(UserRole.STUDENT, UserRole.VENDOR, UserRole.ADMIN, UserRole.SUPER_ADMIN)
  @WebRoles(WebUserRole.SUPERVISION, WebUserRole.ADMIN)
  @ApiOperation({ summary: 'Récupérer un litige' })
  @ApiResponse({ status: 200, description: 'Retourne le litige.', type: DisputeEntity })
  @ApiResponse({ status: 404, description: 'Litige introuvable.' })
  findOne(@Param('id') id: string, @Request() req) {
    return this.disputesService.findOne(id, req.user.id, req.user.role);
  }

  @Patch(':id')
  @ApiBearerAuth()
  @UseGuards(CombinedJwtAuthGuard, CombinedRolesGuard)
  @Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN)
  @WebRoles(WebUserRole.ADMIN)
  @ApiOperation({ summary: 'Traiter un litige : statut, décision, note (Admin seulement)' })
  @ApiResponse({ status: 200, description: 'Le litige a été mis à jour avec succès.', type: DisputeEntity })
  @ApiResponse({ status: 404, description: 'Litige introuvable.' })
  @ApiResponse({ status: 409, description: 'Ce litige a déjà une décision définitive.' })
  update(@Param('id') id: string, @Body() updateDisputeDto: UpdateDisputeDto) {
    return this.disputesService.update(id, updateDisputeDto);
  }
}