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
import { RefundOrderDto } from '../dto/refund-order.dto';
import { OrderEntity } from '../entities/order.entity';
import { FindOrdersQueryDto } from '../dto/find-orders-query.dto';
import { Roles } from '../../../common/decorators/roles.decorator';
import { WebRoles } from '../../../common/decorators/web-roles.decorator';
import { UserRole, WebUserRole } from '@prisma/client';
import { JwtAuthGuard } from '../../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../../common/guards/roles.guard';
import { CombinedJwtAuthGuard } from '../../../common/guards/combined-jwt-auth.guard';
import { CombinedRolesGuard } from '../../../common/guards/combined-roles.guard';
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
  @UseGuards(CombinedJwtAuthGuard, CombinedRolesGuard)
  @Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN, UserRole.STUDENT, UserRole.VENDOR)
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
      req.user.__authKind === 'web' || req.user.role === UserRole.ADMIN || req.user.role === UserRole.SUPER_ADMIN;

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
    );
  }

  @Get(':id')
  @ApiBearerAuth()
  @UseGuards(CombinedJwtAuthGuard, CombinedRolesGuard)
  @Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN, UserRole.STUDENT, UserRole.VENDOR)
  @WebRoles(WebUserRole.SUPERVISION, WebUserRole.ADMIN)
  @ApiOperation({ summary: 'Récupérer une commande active' })
  @ApiResponse({ status: 200, description: 'Retourne la commande.', type: OrderEntity })
  @ApiResponse({ status: 404, description: 'Commande introuvable.' })
  findOne(@Param('id') id: string, @Request() req) {
    const isAdmin =
      req.user.__authKind === 'web' || req.user.role === UserRole.ADMIN || req.user.role === UserRole.SUPER_ADMIN;
    return this.ordersService.findOne(id, { id: req.user.id, role: req.user.role, isAdmin });
  }

  @Patch(':id')
  @ApiBearerAuth()
  @UseGuards(CombinedJwtAuthGuard, CombinedRolesGuard)
  @Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN, UserRole.VENDOR)
  @WebRoles(WebUserRole.ADMIN)
  @ApiOperation({ summary: 'Mettre à jour une commande (Admin mobile/web ou Vendeur)' })
  @ApiResponse({
    status: 200,
    description: 'La commande a été mise à jour avec succès.',
    type: OrderEntity,
  })
  update(@Param('id') id: string, @Body() updateOrderDto: UpdateOrderDto, @Request() req) {
    const isAdmin = req.user.role === UserRole.ADMIN || req.user.role === UserRole.SUPER_ADMIN;
    return this.ordersService.update(id, updateOrderDto, {
      id: req.user.id,
      role: req.user.role,
      isAdmin,
      authKind: req.user.__authKind,
    });
  }

  @Post(':id/cancel')
  @ApiBearerAuth()
  @UseGuards(CombinedJwtAuthGuard, CombinedRolesGuard)
  @Roles(UserRole.STUDENT)
  @ApiOperation({
    summary: 'Annuler sa commande (étudiant) — uniquement PENDING',
    description:
      'Restitue le séquestre et enregistre l\'événement anti-abus (avertissement / suspension 24h / ban).',
  })
  @ApiResponse({ status: 200, description: 'Commande annulée + info anti-abus' })
  cancelByStudent(@Param('id') id: string, @Request() req) {
    return this.ordersService.cancelByStudent(id, req.user.id);
  }

  @Post(':id/refund')
  @ApiBearerAuth()
  @UseGuards(CombinedJwtAuthGuard, CombinedRolesGuard)
  @Roles(UserRole.VENDOR)
  @ApiOperation({
    summary: 'Remboursement post-READY (vendeur mobile) — CDC 4.7',
    description:
      'Motif obligatoire. Débite le solde vendeur ou crée une créance si insuffisant.',
  })
  @ApiResponse({ status: 200, description: 'Remboursement effectué' })
  refundByVendor(
    @Param('id') id: string,
    @Body() dto: RefundOrderDto,
    @Request() req,
  ) {
    return this.ordersService.refundByVendor(id, req.user.id, dto);
  }

  @Delete(':id')
  @ApiBearerAuth()
  @UseGuards(CombinedJwtAuthGuard, CombinedRolesGuard)
  @Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN)
  @WebRoles(WebUserRole.ADMIN)
  @ApiOperation({ summary: 'Supprimer une commande (Admin mobile/web)' })
  @ApiResponse({
    status: 200,
    description: 'La commande a été supprimée avec succès.',
  })
  remove(@Param('id') id: string, @Request() req) {
    return this.ordersService.remove(id, { id: req.user.id, role: req.user.role, isAdmin: true });
  }
}
