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
import { VendorsService } from '../services/vendors.service';
import { CreateVendorDto } from '../dto/create-vendor.dto';
import { UpdateVendorDto } from '../dto/update-vendor.dto';
import { FindVendorsForAdminQueryDto } from '../dto/find-vendors-for-admin-query.dto';
import { VendorEntity } from '../entities/vendor.entity';
import { PaginationDto } from '../../../common/dto/pagination.dto';
import { Roles } from '../../../common/decorators/roles.decorator';
import { WebRoles } from '../../../common/decorators/web-roles.decorator';
import { UserRole, WebUserRole } from '@prisma/client';
import { JwtAuthGuard } from '../../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../../common/guards/roles.guard';
import { CombinedJwtAuthGuard } from '../../../common/guards/combined-jwt-auth.guard';
import { CombinedRolesGuard } from '../../../common/guards/combined-roles.guard';
import { Public } from '../../../common/decorators/public.decorator';

@ApiTags('Vendors')
@Controller('vendors')
export class VendorsController {
  constructor(private readonly vendorsService: VendorsService) {}

  @Post()
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN)
  @ApiOperation({ summary: 'Créer une cantine : crée le compte vendeur (User) et le profil (Vendor) en une seule opération (Admin only)' })
  @ApiResponse({
    status: 201,
    description: 'The vendor has been successfully created.',
    type: VendorEntity,
  })
  create(@Body() createVendorDto: CreateVendorDto) {
    return this.vendorsService.create(createVendorDto);
  }

  @Get()
  @Public()
  @ApiOperation({ summary: 'Get all active vendors' })
  @ApiQuery({ type: PaginationDto })
  @ApiResponse({
    status: 200,
    description: 'Return all active vendors with pagination.',
  })
  findAll(@Query() paginationDto: PaginationDto) {
    return this.vendorsService.findAll(paginationDto.page, paginationDto.limit);
  }

  @Get('admin/list')
  @ApiBearerAuth()
  @UseGuards(CombinedJwtAuthGuard, CombinedRolesGuard)
  @Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN)
  @WebRoles(WebUserRole.ADMIN)
  @ApiOperation({ summary: 'Liste des cantines enrichie (propriétaire, créance, commandes du jour) — dashboard admin web' })
  @ApiQuery({ type: FindVendorsForAdminQueryDto })
  @ApiResponse({ status: 200, description: 'Liste paginée des cantines avec données de gestion.' })
  findAllForAdmin(@Query() query: FindVendorsForAdminQueryDto) {
    return this.vendorsService.findAllForAdmin(query);
  }

  @Get(':id')
  @Public()
  @ApiOperation({ summary: 'Get a single active vendor' })
  @ApiResponse({ status: 200, description: 'Return the vendor.', type: VendorEntity })
  @ApiResponse({ status: 404, description: 'Vendor not found.' })
  findOne(@Param('id') id: string) {
    return this.vendorsService.findOne(id);
  }

  @Patch(':id')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN, UserRole.VENDOR)
  @ApiOperation({ summary: 'Update a vendor (Admin or Vendor)' })
  @ApiResponse({
    status: 200,
    description: 'The vendor has been successfully updated.',
    type: VendorEntity,
  })
  update(@Param('id') id: string, @Body() updateVendorDto: UpdateVendorDto, @Request() req) {
    return this.vendorsService.update(id, updateVendorDto, { id: req.user.id, role: req.user.role });
  }

  @Delete(':id')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN)
  @ApiOperation({ summary: 'Soft delete a vendor (Admin only)' })
  @ApiResponse({
    status: 200,
    description: 'The vendor has been successfully soft deleted.',
  })
  remove(@Param('id') id: string) {
    return this.vendorsService.remove(id);
  }
}
