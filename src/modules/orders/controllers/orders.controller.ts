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
import { OrdersService } from '../services/orders.service';
import { CreateOrderDto } from '../dto/create-order.dto';
import { UpdateOrderDto } from '../dto/update-order.dto';
import { OrderEntity } from '../entities/order.entity';
import { FindOrdersQueryDto } from '../dto/find-orders-query.dto';
import { Roles } from '../../../common/decorators/roles.decorator';
import { UserRole } from '@prisma/client';
import { JwtAuthGuard } from '../../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../../common/guards/roles.guard';
import { Public } from '../../../common/decorators/public.decorator';

@ApiTags('Orders')
@Controller('orders')
export class OrdersController {
  constructor(private readonly ordersService: OrdersService) {}

  @Post()
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.STUDENT)
  @ApiOperation({ summary: 'Créer une nouvelle commande (Étudiant seulement)' })
  @ApiResponse({
    status: 201,
    description: 'La commande a été créée avec succès.',
    type: OrderEntity,
  })
  create(@Body() createOrderDto: CreateOrderDto, @Request() req) {
    return this.ordersService.create(createOrderDto, req.user.id);
  }

  @Get()
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN, UserRole.STUDENT, UserRole.VENDOR)
  @ApiOperation({ summary: 'Récupérer toutes les commandes actives (filtrées par rôle)' })
  @ApiQuery({ type: FindOrdersQueryDto })
  @ApiResponse({
    status: 200,
    description: 'Retourne toutes les commandes actives avec pagination.',
  })
  findAll(@Query() query: FindOrdersQueryDto, @Request() req) {
    let studentId: string | undefined;
    let vendorId: string | undefined;
    if (req.user.role === UserRole.STUDENT) studentId = req.user.id;
    if (req.user.role === UserRole.VENDOR) vendorId = req.user.id;

    // Le filtre vendorId de la query n'est appliqué que pour les admins :
    // un STUDENT/VENDOR reste toujours scopé à son propre périmètre.
    const isAdmin = req.user.role === UserRole.ADMIN || req.user.role === UserRole.SUPER_ADMIN;
    if (isAdmin && query.vendorId) vendorId = query.vendorId;

    return this.ordersService.findAll(
      query.page,
      query.limit,
      studentId,
      vendorId,
      query.status,
    );
  }

  @Get(':id')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN, UserRole.STUDENT, UserRole.VENDOR)
  @ApiOperation({ summary: 'Récupérer une commande active' })
  @ApiResponse({ status: 200, description: 'Retourne la commande.', type: OrderEntity })
  @ApiResponse({ status: 404, description: 'Commande introuvable.' })
  findOne(@Param('id') id: string) {
    return this.ordersService.findOne(id);
  }

  @Patch(':id')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN, UserRole.VENDOR)
  @ApiOperation({ summary: 'Mettre à jour une commande (Admin ou Vendeur)' })
  @ApiResponse({
    status: 200,
    description: 'La commande a été mise à jour avec succès.',
    type: OrderEntity,
  })
  update(@Param('id') id: string, @Body() updateOrderDto: UpdateOrderDto) {
    return this.ordersService.update(id, updateOrderDto);
  }

  @Delete(':id')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN)
  @ApiOperation({ summary: 'Supprimer une commande (Admin seulement)' })
  @ApiResponse({
    status: 200,
    description: 'La commande a été supprimée avec succès.',
  })
  remove(@Param('id') id: string) {
    return this.ordersService.remove(id);
  }
}
