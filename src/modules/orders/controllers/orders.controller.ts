import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
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
import { CancelOrderDto } from '../dto/cancel-order.dto';
import { OrderEntity } from '../entities/order.entity';
import { FindOrdersQueryDto } from '../dto/find-orders-query.dto';
import { Roles } from '../../../common/decorators/roles.decorator';
import { WebRoles } from '../../../common/decorators/web-roles.decorator';
import { UserRole, WebUserRole } from '@prisma/client';
import { JwtAuthGuard } from '../../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../../common/guards/roles.guard';
import { CombinedJwtAuthGuard } from '../../../common/guards/combined-jwt-auth.guard';
import { CombinedRolesGuard } from '../../../common/guards/combined-roles.guard';

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
  @UseGuards(CombinedJwtAuthGuard, CombinedRolesGuard)
  @Roles(UserRole.ADMIN, UserRole.STUDENT, UserRole.VENDOR)
  @WebRoles(WebUserRole.SUPERVISION, WebUserRole.ADMIN)
  @ApiOperation({ summary: 'Récupérer toutes les commandes actives (filtrées par rôle)' })
  @ApiQuery({ type: FindOrdersQueryDto })
  @ApiResponse({
    status: 200,
    description: 'Retourne toutes les commandes actives avec pagination.',
  })
  findAll(@Query() query: FindOrdersQueryDto, @Request() req) {
    let studentId: string | undefined;
    let vendorId: string | undefined;
    let vendorUserId: string | undefined;
    const isAdmin =
      req.user.__authKind === 'web' || req.user.role === UserRole.ADMIN;

    if (!isAdmin && req.user.role === UserRole.STUDENT) studentId = req.user.id;
    if (!isAdmin && req.user.role === UserRole.VENDOR) vendorUserId = req.user.id;

    // Le filtre vendorId de la query n'est appliqué que pour les admins :
    // un STUDENT/VENDOR reste toujours scopé à son propre périmètre.
    if (isAdmin && query.vendorId) vendorId = query.vendorId;

    return this.ordersService.findAll(
      query.page,
      query.limit,
      studentId,
      vendorId,
      query.status,
      vendorUserId,
      query.statuses,
      isAdmin ? query.campusId : undefined,
      query.from,
      query.to,
    );
  }

  @Get(':id')
  @ApiBearerAuth()
  @UseGuards(CombinedJwtAuthGuard, CombinedRolesGuard)
  @Roles(UserRole.ADMIN, UserRole.STUDENT, UserRole.VENDOR)
  @WebRoles(WebUserRole.SUPERVISION, WebUserRole.ADMIN)
  @ApiOperation({ summary: 'Récupérer une commande active' })
  @ApiResponse({ status: 200, description: 'Retourne la commande.', type: OrderEntity })
  @ApiResponse({ status: 404, description: 'Commande introuvable.' })
  findOne(@Param('id') id: string, @Request() req) {
    const isAdmin =
      req.user.__authKind === 'web' || req.user.role === UserRole.ADMIN;
    return this.ordersService.findOne(id, { id: req.user.id, role: req.user.role, isAdmin });
  }

  @Patch(':id')
  @ApiBearerAuth()
  @UseGuards(CombinedJwtAuthGuard, CombinedRolesGuard)
  @Roles(UserRole.ADMIN, UserRole.VENDOR)
  @WebRoles(WebUserRole.ADMIN)
  @ApiOperation({ summary: "Faire avancer le statut d'une commande, dans l'ordre (Admin web ou Vendeuse)" })
  @ApiResponse({
    status: 200,
    description: 'La commande a été mise à jour avec succès.',
    type: OrderEntity,
  })
  update(@Param('id') id: string, @Body() updateOrderDto: UpdateOrderDto, @Request() req) {
    const isAdmin = req.user.role === UserRole.ADMIN;
    return this.ordersService.update(id, updateOrderDto, {
      id: req.user.id,
      role: req.user.role,
      isAdmin,
      authKind: req.user.__authKind,
    });
  }

  @Post(':id/cancel')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.STUDENT, UserRole.VENDOR)
  @ApiOperation({
    summary: 'Annuler une commande (étudiant ou vendeuse)',
    description:
      "Étudiant : ses commandes tant qu'elles sont CONFIRMED, motif facultatif. Vendeuse : les commandes de sa cantine en CONFIRMED ou IN_PREPARATION, motif obligatoire. Aucune annulation en READY, RECEIVED ou CANCELLED. L'administrateur n'annule jamais. Remboursement intégral en tickets, une seule fois.",
  })
  @ApiResponse({ status: 200, description: 'Commande annulée et remboursée : { order }' })
  cancel(@Param('id') id: string, @Body() dto: CancelOrderDto, @Request() req) {
    return this.ordersService.cancel(id, dto, {
      id: req.user.id,
      role: req.user.role,
      isAdmin: req.user.role === UserRole.ADMIN,
      authKind: req.user.__authKind,
    });
  }
}
