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
import { CreateTakeawayOptionDto } from '../dto/create-takeaway-option.dto';
import { UpdateTakeawayOptionDto } from '../dto/update-takeaway-option.dto';
import { TakeawayOptionEntity } from '../entities/takeaway-option.entity';
import { PaginationDto } from '../../../common/dto/pagination.dto';
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
