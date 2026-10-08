import { Body, Controller, Delete, Get, Param, Patch, Post, Request, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { UserRole, WebUserRole } from '@prisma/client';
import { ComponentsActor, ComponentsService } from '../services/components.service';
import { CreateComponentCategoryDto } from '../dto/create-component-category.dto';
import { UpdateComponentCategoryDto } from '../dto/update-component-category.dto';
import { CreateComponentDto } from '../dto/create-component.dto';
import { UpdateComponentDto } from '../dto/update-component.dto';
import { AdjustStockDto } from '../dto/adjust-stock.dto';
import { ComponentCategoryEntity } from '../entities/component-category.entity';
import { ComponentEntity, PublicComponentEntity, StockAdjustmentEntity } from '../entities/component.entity';
import { Roles } from '../../../common/decorators/roles.decorator';
import { WebRoles } from '../../../common/decorators/web-roles.decorator';
import { Public } from '../../../common/decorators/public.decorator';
import { CombinedJwtAuthGuard } from '../../../common/guards/combined-jwt-auth.guard';
import { CombinedRolesGuard } from '../../../common/guards/combined-roles.guard';

function actorFromRequest(req: any): ComponentsActor {
  return {
    id: req.user.id,
    role: req.user.role,
    isAdmin: req.user.role === UserRole.ADMIN,
  };
}

@ApiTags('Components')
@Controller()
export class ComponentsController {
  constructor(private readonly componentsService: ComponentsService) {}

  // ─── Catégories ───────────────────────────────────────────────────

  @Post('component-categories')
  @ApiBearerAuth()
  @UseGuards(CombinedJwtAuthGuard, CombinedRolesGuard)
  @Roles(UserRole.ADMIN, UserRole.VENDOR)
  @WebRoles(WebUserRole.ADMIN)
  @ApiOperation({ summary: 'Créer une catégorie de composants (Admin ou Vendeuse)' })
  @ApiResponse({ status: 201, type: ComponentCategoryEntity })
  createCategory(@Body() dto: CreateComponentCategoryDto, @Request() req) {
    return this.componentsService.createCategory(dto, actorFromRequest(req));
  }

  @Get('component-categories/:vendorId')
  @Public()
  @ApiOperation({ summary: "Lister les catégories de composants d'une cantine" })
  @ApiResponse({ status: 200, type: [ComponentCategoryEntity] })
  findCategories(@Param('vendorId') vendorId: string) {
    return this.componentsService.findCategories(vendorId);
  }

  @Patch('component-categories/:id')
  @ApiBearerAuth()
  @UseGuards(CombinedJwtAuthGuard, CombinedRolesGuard)
  @Roles(UserRole.ADMIN, UserRole.VENDOR)
  @WebRoles(WebUserRole.ADMIN)
  @ApiOperation({ summary: 'Renommer une catégorie (Admin ou Vendeuse propriétaire)' })
  @ApiResponse({ status: 200, type: ComponentCategoryEntity })
  updateCategory(@Param('id') id: string, @Body() dto: UpdateComponentCategoryDto, @Request() req) {
    return this.componentsService.updateCategory(id, dto, actorFromRequest(req));
  }

  @Delete('component-categories/:id')
  @ApiBearerAuth()
  @UseGuards(CombinedJwtAuthGuard, CombinedRolesGuard)
  @Roles(UserRole.ADMIN, UserRole.VENDOR)
  @WebRoles(WebUserRole.ADMIN)
  @ApiOperation({ summary: 'Supprimer (logiquement) une catégorie (Admin ou Vendeuse propriétaire)' })
  @ApiResponse({ status: 200, description: 'Catégorie supprimée logiquement.' })
  @ApiResponse({ status: 409, description: 'Des composants non supprimés sont encore rattachés à cette catégorie.' })
  removeCategory(@Param('id') id: string, @Request() req) {
    return this.componentsService.removeCategory(id, actorFromRequest(req));
  }

  // ─── Composants ───────────────────────────────────────────────────

  @Post('components')
  @ApiBearerAuth()
  @UseGuards(CombinedJwtAuthGuard, CombinedRolesGuard)
  @Roles(UserRole.ADMIN, UserRole.VENDOR)
  @WebRoles(WebUserRole.ADMIN)
  @ApiOperation({ summary: 'Créer un composant (Admin ou Vendeuse)' })
  @ApiResponse({ status: 201, type: ComponentEntity })
  createComponent(@Body() dto: CreateComponentDto, @Request() req) {
    return this.componentsService.createComponent(dto, actorFromRequest(req));
  }

  // Déclaré avant `components/:vendorId` par lisibilité (segments différents, pas de conflit de routes).
  @Get('components/manage/:vendorId')
  @ApiBearerAuth()
  @UseGuards(CombinedJwtAuthGuard, CombinedRolesGuard)
  @Roles(UserRole.ADMIN, UserRole.VENDOR)
  @WebRoles(WebUserRole.ADMIN)
  @ApiOperation({ summary: "Lister tous les composants d'une cantine avec stock et seuil (Admin ou Vendeuse propriétaire)" })
  @ApiResponse({ status: 200, type: [ComponentEntity] })
  findManagedComponents(@Param('vendorId') vendorId: string, @Request() req) {
    return this.componentsService.findManagedComponents(vendorId, actorFromRequest(req));
  }

  @Get('components/:vendorId')
  @Public()
  @ApiOperation({ summary: "Lister les composants d'une cantine, sans quantité (étudiants)" })
  @ApiResponse({ status: 200, type: [PublicComponentEntity] })
  findPublicComponents(@Param('vendorId') vendorId: string) {
    return this.componentsService.findPublicComponents(vendorId);
  }

  @Patch('components/:id/stock')
  @ApiBearerAuth()
  @UseGuards(CombinedJwtAuthGuard, CombinedRolesGuard)
  @Roles(UserRole.ADMIN, UserRole.VENDOR)
  @WebRoles(WebUserRole.ADMIN)
  @ApiOperation({ summary: 'Ajuster le stock par delta, de façon atomique (Admin ou Vendeuse propriétaire)' })
  @ApiResponse({ status: 200, type: StockAdjustmentEntity })
  @ApiResponse({ status: 409, description: 'Stock insuffisant pour un ajustement négatif.' })
  adjustStock(@Param('id') id: string, @Body() dto: AdjustStockDto, @Request() req) {
    return this.componentsService.adjustStock(id, dto, actorFromRequest(req));
  }

  @Patch('components/:id')
  @ApiBearerAuth()
  @UseGuards(CombinedJwtAuthGuard, CombinedRolesGuard)
  @Roles(UserRole.ADMIN, UserRole.VENDOR)
  @WebRoles(WebUserRole.ADMIN)
  @ApiOperation({ summary: 'Modifier un composant, sans la quantité (Admin ou Vendeuse propriétaire)' })
  @ApiResponse({ status: 200, type: ComponentEntity })
  updateComponent(@Param('id') id: string, @Body() dto: UpdateComponentDto, @Request() req) {
    return this.componentsService.updateComponent(id, dto, actorFromRequest(req));
  }

  @Delete('components/:id')
  @ApiBearerAuth()
  @UseGuards(CombinedJwtAuthGuard, CombinedRolesGuard)
  @Roles(UserRole.ADMIN, UserRole.VENDOR)
  @WebRoles(WebUserRole.ADMIN)
  @ApiOperation({ summary: 'Supprimer (logiquement) un composant (Admin ou Vendeuse propriétaire)' })
  @ApiResponse({ status: 200, description: 'Composant supprimé logiquement.' })
  removeComponent(@Param('id') id: string, @Request() req) {
    return this.componentsService.removeComponent(id, actorFromRequest(req));
  }
}
