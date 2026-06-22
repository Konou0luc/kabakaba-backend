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
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiQuery,
} from '@nestjs/swagger';
import { CatalogService } from '../services/catalog.service';
import { CreateMenuItemDto } from '../dto/create-menu-item.dto';
import { UpdateMenuItemDto } from '../dto/update-menu-item.dto';
import { CreateMenuComponentDto } from '../dto/create-menu-component.dto';
import { UpdateMenuComponentDto } from '../dto/update-menu-component.dto';
import { CreatePackagingOptionDto } from '../dto/create-packaging-option.dto';
import { UpdatePackagingOptionDto } from '../dto/update-packaging-option.dto';
import { MenuItemEntity } from '../entities/menu-item.entity';
import { MenuComponentEntity } from '../entities/menu-component.entity';
import { PackagingOptionEntity } from '../entities/packaging-option.entity';
import { PaginationDto } from '../../../common/dto/pagination.dto';
import { Roles } from '../../../common/decorators/roles.decorator';
import { UserRole } from '@prisma/client';
import { JwtAuthGuard } from '../../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../../common/guards/roles.guard';
import { Public } from '../../../common/decorators/public.decorator';

@ApiTags('Catalog')
@Controller('catalog')
export class CatalogController {
  constructor(private readonly catalogService: CatalogService) {}

  @Post('menu-items')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN, UserRole.VENDOR)
  @ApiOperation({ summary: 'Create a new menu item (Admin or Vendor)' })
  @ApiResponse({
    status: 201,
    description: 'The menu item has been successfully created.',
    type: MenuItemEntity,
  })
  createMenuItem(@Body() createMenuItemDto: CreateMenuItemDto) {
    return this.catalogService.createMenuItem(createMenuItemDto);
  }

  @Get('menu-items')
  @Public()
  @ApiOperation({ summary: 'Get all active menu items' })
  @ApiQuery({ name: 'vendorId', required: false, type: String, description: 'Filter by vendor ID' })
  @ApiQuery({ type: PaginationDto })
  @ApiResponse({
    status: 200,
    description: 'Return all active menu items with pagination.',
  })
  findAllMenuItems(
    @Query('vendorId') vendorId?: string,
    @Query() paginationDto?: PaginationDto,
  ) {
    return this.catalogService.findAllMenuItems(
      paginationDto?.page,
      paginationDto?.limit,
      vendorId,
    );
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
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN, UserRole.VENDOR)
  @ApiOperation({ summary: 'Update a menu item (Admin or Vendor)' })
  @ApiResponse({
    status: 200,
    description: 'The menu item has been successfully updated.',
    type: MenuItemEntity,
  })
  updateMenuItem(@Param('id') id: string, @Body() updateMenuItemDto: UpdateMenuItemDto) {
    return this.catalogService.updateMenuItem(id, updateMenuItemDto);
  }

  @Delete('menu-items/:id')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN, UserRole.VENDOR)
  @ApiOperation({ summary: 'Soft delete a menu item (Admin or Vendor)' })
  @ApiResponse({
    status: 200,
    description: 'The menu item has been successfully soft deleted.',
  })
  removeMenuItem(@Param('id') id: string) {
    return this.catalogService.removeMenuItem(id);
  }

  // Menu Components
  @Post('menu-components')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN, UserRole.VENDOR)
  @ApiOperation({ summary: 'Create a new menu component (Admin or Vendor)' })
  @ApiResponse({
    status: 201,
    description: 'The menu component has been successfully created.',
    type: MenuComponentEntity,
  })
  createMenuComponent(@Body() createMenuComponentDto: CreateMenuComponentDto) {
    return this.catalogService.createMenuComponent(createMenuComponentDto);
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
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN, UserRole.VENDOR)
  @ApiOperation({ summary: 'Update a menu component (Admin or Vendor)' })
  @ApiResponse({
    status: 200,
    description: 'The menu component has been successfully updated.',
    type: MenuComponentEntity,
  })
  updateMenuComponent(
    @Param('id') id: string,
    @Body() updateMenuComponentDto: UpdateMenuComponentDto,
  ) {
    return this.catalogService.updateMenuComponent(id, updateMenuComponentDto);
  }

  @Delete('menu-components/:id')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN, UserRole.VENDOR)
  @ApiOperation({ summary: 'Soft delete a menu component (Admin or Vendor)' })
  @ApiResponse({
    status: 200,
    description: 'The menu component has been successfully soft deleted.',
  })
  removeMenuComponent(@Param('id') id: string) {
    return this.catalogService.removeMenuComponent(id);
  }

  // Packaging Options
  @Post('packaging-options')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN, UserRole.VENDOR)
  @ApiOperation({ summary: 'Create a new packaging option (Admin or Vendor)' })
  @ApiResponse({
    status: 201,
    description: 'The packaging option has been successfully created.',
    type: PackagingOptionEntity,
  })
  createPackagingOption(@Body() createPackagingOptionDto: CreatePackagingOptionDto) {
    return this.catalogService.createPackagingOption(createPackagingOptionDto);
  }

  @Get('packaging-options/:itemId')
  @Public()
  @ApiOperation({ summary: 'Get all active packaging options for a menu item' })
  @ApiQuery({ type: PaginationDto })
  @ApiResponse({
    status: 200,
    description: 'Return all active packaging options with pagination.',
  })
  findAllPackagingOptions(
    @Param('itemId') itemId: string,
    @Query() paginationDto?: PaginationDto,
  ) {
    return this.catalogService.findAllPackagingOptions(
      itemId,
      paginationDto?.page,
      paginationDto?.limit,
    );
  }

  @Get('packaging-options/detail/:id')
  @Public()
  @ApiOperation({ summary: 'Get a single active packaging option' })
  @ApiResponse({ status: 200, description: 'Return the packaging option.', type: PackagingOptionEntity })
  @ApiResponse({ status: 404, description: 'Packaging option not found.' })
  findOnePackagingOption(@Param('id') id: string) {
    return this.catalogService.findOnePackagingOption(id);
  }

  @Patch('packaging-options/:id')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN, UserRole.VENDOR)
  @ApiOperation({ summary: 'Update a packaging option (Admin or Vendor)' })
  @ApiResponse({
    status: 200,
    description: 'The packaging option has been successfully updated.',
    type: PackagingOptionEntity,
  })
  updatePackagingOption(
    @Param('id') id: string,
    @Body() updatePackagingOptionDto: UpdatePackagingOptionDto,
  ) {
    return this.catalogService.updatePackagingOption(id, updatePackagingOptionDto);
  }

  @Delete('packaging-options/:id')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN, UserRole.VENDOR)
  @ApiOperation({ summary: 'Soft delete a packaging option (Admin or Vendor)' })
  @ApiResponse({
    status: 200,
    description: 'The packaging option has been successfully soft deleted.',
  })
  removePackagingOption(@Param('id') id: string) {
    return this.catalogService.removePackagingOption(id);
  }
}
