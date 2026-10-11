import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  Query,
  UseGuards,
  Request,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiQuery,
} from '@nestjs/swagger';
import { CatalogService, CatalogActor } from '../services/catalog.service';
import { CreateMenuItemDto } from '../dto/create-menu-item.dto';
import { UpdateMenuItemDto } from '../dto/update-menu-item.dto';
import { CreateMenuComponentDto } from '../dto/create-menu-component.dto';
import { UpdateMenuComponentDto } from '../dto/update-menu-component.dto';
import { CreateTakeawayOptionDto } from '../dto/create-takeaway-option.dto';
import { UpdateTakeawayOptionDto } from '../dto/update-takeaway-option.dto';
import { MenuItemEntity } from '../entities/menu-item.entity';
import { MenuComponentEntity } from '../entities/menu-component.entity';
import { TakeawayOptionEntity } from '../entities/takeaway-option.entity';
import { PaginationDto } from '../../../common/dto/pagination.dto';
import { FindMenuItemsQueryDto } from '../dto/find-menu-items-query.dto';
import { Roles } from '../../../common/decorators/roles.decorator';
import { WebRoles } from '../../../common/decorators/web-roles.decorator';
import { UserRole, WebUserRole } from '@prisma/client';
import { CombinedJwtAuthGuard } from '../../../common/guards/combined-jwt-auth.guard';
import { CombinedRolesGuard } from '../../../common/guards/combined-roles.guard';
import { Public } from '../../../common/decorators/public.decorator';

function actorFromRequest(req: any): CatalogActor {
  return {
    id: req.user.id,
    role: req.user.role,
    isAdmin: req.user.role === UserRole.ADMIN,
  };
}

@ApiTags('Catalog')
@Controller('catalog')
export class CatalogController {
  constructor(private readonly catalogService: CatalogService) {}

  @Post('menu-items')
  @ApiBearerAuth()
  @UseGuards(CombinedJwtAuthGuard, CombinedRolesGuard)
  @Roles(UserRole.ADMIN, UserRole.VENDOR)
  @WebRoles(WebUserRole.ADMIN)
  @ApiOperation({ summary: 'Create a new menu item (Admin or Vendor)' })
  @ApiResponse({
    status: 201,
    description: 'The menu item has been successfully created.',
    type: MenuItemEntity,
  })
  createMenuItem(@Body() createMenuItemDto: CreateMenuItemDto, @Request() req) {
    return this.catalogService.createMenuItem(createMenuItemDto, actorFromRequest(req));
  }

  @Get('menu-items')
  @Public()
  @ApiOperation({ summary: 'Get all active menu items' })
  @ApiQuery({ type: FindMenuItemsQueryDto })
  @ApiResponse({
    status: 200,
    description: 'Return all active menu items with pagination.',
  })
  findAllMenuItems(@Query() query: FindMenuItemsQueryDto) {
    return this.catalogService.findAllMenuItems(query.page, query.limit, query.vendorId);
  }

  @Get('menu-items/:id')
  @Public()
  @ApiOperation({ summary: 'Get a single active menu item' })
  @ApiResponse({ status: 200, description: 'Return the menu item.', type: MenuItemEntity })
  @ApiResponse({ status: 404, description: 'Menu item not found.' })
  findOneMenuItem(@Param('id') id: string) {
    return this.catalogService.findOneMenuItem(id);
  }

  @Patch('menu-items/:id')
  @ApiBearerAuth()
  @UseGuards(CombinedJwtAuthGuard, CombinedRolesGuard)
  @Roles(UserRole.ADMIN, UserRole.VENDOR)
  @WebRoles(WebUserRole.ADMIN)
  @ApiOperation({ summary: 'Update a menu item (Admin or Vendor)' })
  @ApiResponse({
    status: 200,
    description: 'The menu item has been successfully updated.',
    type: MenuItemEntity,
  })
  updateMenuItem(@Param('id') id: string, @Body() updateMenuItemDto: UpdateMenuItemDto, @Request() req) {
    return this.catalogService.updateMenuItem(id, updateMenuItemDto, actorFromRequest(req));
  }

  @Delete('menu-items/:id')
  @ApiBearerAuth()
  @UseGuards(CombinedJwtAuthGuard, CombinedRolesGuard)
  @Roles(UserRole.ADMIN, UserRole.VENDOR)
  @WebRoles(WebUserRole.ADMIN)
  @ApiOperation({ summary: 'Soft delete a menu item (Admin or Vendor)' })
  @ApiResponse({
    status: 200,
    description: 'The menu item has been successfully soft deleted.',
  })
  removeMenuItem(@Param('id') id: string, @Request() req) {
    return this.catalogService.removeMenuItem(id, actorFromRequest(req));
  }

  // Menu Components
  @Post('menu-components')
  @ApiBearerAuth()
  @UseGuards(CombinedJwtAuthGuard, CombinedRolesGuard)
  @Roles(UserRole.ADMIN, UserRole.VENDOR)
  @WebRoles(WebUserRole.ADMIN)
  @ApiOperation({ summary: 'Create a new menu component (Admin or Vendor)' })
  @ApiResponse({
    status: 201,
    description: 'The menu component has been successfully created.',
    type: MenuComponentEntity,
  })
  createMenuComponent(@Body() createMenuComponentDto: CreateMenuComponentDto, @Request() req) {
    return this.catalogService.createMenuComponent(createMenuComponentDto, actorFromRequest(req));
  }

  @Get('menu-components/:itemId')
  @Public()
  @ApiOperation({ summary: 'Get all active menu components for a menu item' })
  @ApiQuery({ type: PaginationDto })
  @ApiResponse({
    status: 200,
    description: 'Return all active menu components with pagination.',
  })
  findAllMenuComponents(
    @Param('itemId') itemId: string,
    @Query() paginationDto?: PaginationDto,
  ) {
    return this.catalogService.findAllMenuComponents(
      itemId,
      paginationDto?.page,
      paginationDto?.limit,
    );
  }

  @Get('menu-components/detail/:id')
  @Public()
  @ApiOperation({ summary: 'Get a single active menu component' })
  @ApiResponse({ status: 200, description: 'Return the menu component.', type: MenuComponentEntity })
  @ApiResponse({ status: 404, description: 'Menu component not found.' })
  findOneMenuComponent(@Param('id') id: string) {
    return this.catalogService.findOneMenuComponent(id);
  }

  @Patch('menu-components/:id')
  @ApiBearerAuth()
  @UseGuards(CombinedJwtAuthGuard, CombinedRolesGuard)
  @Roles(UserRole.ADMIN, UserRole.VENDOR)
  @WebRoles(WebUserRole.ADMIN)
  @ApiOperation({ summary: 'Update a menu component (Admin or Vendor)' })
  @ApiResponse({
    status: 200,
    description: 'The menu component has been successfully updated.',
    type: MenuComponentEntity,
  })
  updateMenuComponent(
    @Param('id') id: string,
    @Body() updateMenuComponentDto: UpdateMenuComponentDto,
    @Request() req,
  ) {
    return this.catalogService.updateMenuComponent(id, updateMenuComponentDto, actorFromRequest(req));
  }

  @Delete('menu-components/:id')
  @ApiBearerAuth()
  @UseGuards(CombinedJwtAuthGuard, CombinedRolesGuard)
  @Roles(UserRole.ADMIN, UserRole.VENDOR)
  @WebRoles(WebUserRole.ADMIN)
  @ApiOperation({ summary: 'Soft delete a menu component (Admin or Vendor)' })
  @ApiResponse({
    status: 200,
    description: 'The menu component has been successfully soft deleted.',
  })
  removeMenuComponent(@Param('id') id: string, @Request() req) {
    return this.catalogService.removeMenuComponent(id, actorFromRequest(req));
  }

  // Options d'emporté
  @Post('takeaway-options')
  @ApiBearerAuth()
  @UseGuards(CombinedJwtAuthGuard, CombinedRolesGuard)
  @Roles(UserRole.ADMIN, UserRole.VENDOR)
  @WebRoles(WebUserRole.ADMIN)
  @ApiOperation({ summary: "Créer une option d'emporté (Admin ou Vendeuse)" })
  @ApiResponse({
    status: 201,
    description: "L'option d'emporté a été créée.",
    type: TakeawayOptionEntity,
  })
  createTakeawayOption(@Body() createTakeawayOptionDto: CreateTakeawayOptionDto, @Request() req) {
    return this.catalogService.createTakeawayOption(createTakeawayOptionDto, actorFromRequest(req));
  }

  @Get('takeaway-options/manage/:vendorId')
  @ApiBearerAuth()
  @UseGuards(CombinedJwtAuthGuard, CombinedRolesGuard)
  @Roles(UserRole.ADMIN, UserRole.VENDOR)
  @WebRoles(WebUserRole.ADMIN)
  @ApiOperation({ summary: "Lister toutes les options d'emporté d'une cantine, actives ou non (Admin ou Vendeuse propriétaire)" })
  @ApiQuery({ type: PaginationDto })
  @ApiResponse({ status: 200, description: "Retourne les options d'emporté non supprimées, avec pagination." })
  findManagedTakeawayOptions(
    @Param('vendorId') vendorId: string,
    @Request() req,
    @Query() paginationDto?: PaginationDto,
  ) {
    return this.catalogService.findManagedTakeawayOptions(
      vendorId,
      actorFromRequest(req),
      paginationDto?.page,
      paginationDto?.limit,
    );
  }

  @Get('takeaway-options/:vendorId')
  @Public()
  @ApiOperation({ summary: "Lister les options d'emporté actives d'une cantine" })
  @ApiQuery({ type: PaginationDto })
  @ApiResponse({ status: 200, description: "Retourne les options d'emporté actives, avec pagination. Liste vide : l'emporté n'est pas disponible." })
  findActiveTakeawayOptions(
    @Param('vendorId') vendorId: string,
    @Query() paginationDto?: PaginationDto,
  ) {
    return this.catalogService.findActiveTakeawayOptions(
      vendorId,
      paginationDto?.page,
      paginationDto?.limit,
    );
  }

  @Patch('takeaway-options/:id')
  @ApiBearerAuth()
  @UseGuards(CombinedJwtAuthGuard, CombinedRolesGuard)
  @Roles(UserRole.ADMIN, UserRole.VENDOR)
  @WebRoles(WebUserRole.ADMIN)
  @ApiOperation({ summary: "Modifier une option d'emporté : nom, prix, activation (Admin ou Vendeuse propriétaire)" })
  @ApiResponse({
    status: 200,
    description: "L'option d'emporté a été modifiée.",
    type: TakeawayOptionEntity,
  })
  updateTakeawayOption(
    @Param('id') id: string,
    @Body() updateTakeawayOptionDto: UpdateTakeawayOptionDto,
    @Request() req,
  ) {
    return this.catalogService.updateTakeawayOption(id, updateTakeawayOptionDto, actorFromRequest(req));
  }

  @Delete('takeaway-options/:id')
  @ApiBearerAuth()
  @UseGuards(CombinedJwtAuthGuard, CombinedRolesGuard)
  @Roles(UserRole.ADMIN, UserRole.VENDOR)
  @WebRoles(WebUserRole.ADMIN)
  @ApiOperation({ summary: "Supprimer (suppression logique) une option d'emporté (Admin ou Vendeuse propriétaire)" })
  @ApiResponse({
    status: 200,
    description: "L'option d'emporté a été supprimée logiquement.",
  })
  removeTakeawayOption(@Param('id') id: string, @Request() req) {
    return this.catalogService.removeTakeawayOption(id, actorFromRequest(req));
  }
}
