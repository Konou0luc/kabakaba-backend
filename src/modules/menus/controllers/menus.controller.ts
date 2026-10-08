import { Body, Controller, Delete, Get, Param, Patch, Post, Request, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { UserRole, WebUserRole } from '@prisma/client';
import { MenusActor, MenusService } from '../services/menus.service';
import { CreateMenuDto } from '../dto/create-menu.dto';
import { UpdateMenuDto } from '../dto/update-menu.dto';
import { ManagedMenuEntity, PublicMenuEntity } from '../entities/menu.entity';
import { Roles } from '../../../common/decorators/roles.decorator';
import { WebRoles } from '../../../common/decorators/web-roles.decorator';
import { Public } from '../../../common/decorators/public.decorator';
import { CombinedJwtAuthGuard } from '../../../common/guards/combined-jwt-auth.guard';
import { CombinedRolesGuard } from '../../../common/guards/combined-roles.guard';

function actorFromRequest(req: any): MenusActor {
  return {
    id: req.user.id,
    role: req.user.role,
    isAdmin: req.user.role === UserRole.ADMIN,
  };
}

@ApiTags('Menus')
@Controller('menus')
export class MenusController {
  constructor(private readonly menusService: MenusService) {}

  @Post()
  @ApiBearerAuth()
  @UseGuards(CombinedJwtAuthGuard, CombinedRolesGuard)
  @Roles(UserRole.ADMIN, UserRole.VENDOR)
  @WebRoles(WebUserRole.ADMIN)
  @ApiOperation({ summary: 'Créer un menu pré-composé (Admin ou Vendeuse). Le prix est calculé, jamais saisi.' })
  @ApiResponse({ status: 201, type: ManagedMenuEntity })
  create(@Body() dto: CreateMenuDto, @Request() req) {
    return this.menusService.create(dto, actorFromRequest(req));
  }

  // Déclarée avant `:vendorId` : les deux routes ont des nombres de segments différents,
  // mais cet ordre évite toute ambiguïté.
  @Get('manage/:vendorId')
  @ApiBearerAuth()
  @UseGuards(CombinedJwtAuthGuard, CombinedRolesGuard)
  @Roles(UserRole.ADMIN, UserRole.VENDOR)
  @WebRoles(WebUserRole.ADMIN)
  @ApiOperation({ summary: "Lister tous les menus d'une cantine, actifs ou non (Admin ou Vendeuse propriétaire)" })
  @ApiResponse({ status: 200, type: [ManagedMenuEntity] })
  findManaged(@Param('vendorId') vendorId: string, @Request() req) {
    return this.menusService.findManaged(vendorId, actorFromRequest(req));
  }

  @Get(':vendorId')
  @Public()
  @ApiOperation({ summary: "Lister les menus actifs d'une cantine, avec prix et disponibilité calculés (étudiants)" })
  @ApiResponse({ status: 200, type: [PublicMenuEntity] })
  findPublic(@Param('vendorId') vendorId: string) {
    return this.menusService.findPublic(vendorId);
  }

  @Patch(':id')
  @ApiBearerAuth()
  @UseGuards(CombinedJwtAuthGuard, CombinedRolesGuard)
  @Roles(UserRole.ADMIN, UserRole.VENDOR)
  @WebRoles(WebUserRole.ADMIN)
  @ApiOperation({ summary: 'Modifier un menu ; `lines` remplace toute la liste, de façon atomique (Admin ou Vendeuse propriétaire)' })
  @ApiResponse({ status: 200, type: ManagedMenuEntity })
  update(@Param('id') id: string, @Body() dto: UpdateMenuDto, @Request() req) {
    return this.menusService.update(id, dto, actorFromRequest(req));
  }

  @Delete(':id')
  @ApiBearerAuth()
  @UseGuards(CombinedJwtAuthGuard, CombinedRolesGuard)
  @Roles(UserRole.ADMIN, UserRole.VENDOR)
  @WebRoles(WebUserRole.ADMIN)
  @ApiOperation({ summary: 'Supprimer (logiquement) un menu (Admin ou Vendeuse propriétaire)' })
  @ApiResponse({ status: 200, description: 'Menu supprimé logiquement.' })
  remove(@Param('id') id: string, @Request() req) {
    return this.menusService.remove(id, actorFromRequest(req));
  }
}
