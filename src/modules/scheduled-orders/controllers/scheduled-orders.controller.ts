import { Body, Controller, Get, Param, Post, Query, Request, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiQuery, ApiResponse, ApiTags } from '@nestjs/swagger';
import { UserRole } from '@prisma/client';
import { Roles } from '../../../common/decorators/roles.decorator';
import { JwtAuthGuard } from '../../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../../common/guards/roles.guard';
import { ScheduledOrdersService } from '../services/scheduled-orders.service';
import { CreateScheduledOrderDto } from '../dto/create-scheduled-order.dto';
import { FindScheduledOrdersQueryDto } from '../dto/find-scheduled-orders-query.dto';
import { ScheduledOrderEntity } from '../entities/scheduled-order.entity';

@ApiTags('Scheduled orders')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.STUDENT)
@Controller('scheduled-orders')
export class ScheduledOrdersController {
  constructor(private readonly scheduledOrdersService: ScheduledOrdersService) {}

  @Post()
  @ApiOperation({
    summary: 'Programmer une commande pour une heure donnée (Étudiant seulement)',
    description:
      "Aucun ticket n'est débité et aucun stock n'est réservé avant l'heure prévue : la commande est créée à ce moment-là, ou échoue avec un motif.",
  })
  @ApiResponse({ status: 201, description: 'La commande programmée a été enregistrée.', type: ScheduledOrderEntity })
  create(@Body() createScheduledOrderDto: CreateScheduledOrderDto, @Request() req) {
    return this.scheduledOrdersService.create(createScheduledOrderDto, req.user.id);
  }

  @Get()
  @ApiOperation({ summary: 'Lister mes commandes programmées (Étudiant seulement)' })
  @ApiQuery({ type: FindScheduledOrdersQueryDto })
  @ApiResponse({ status: 200, description: 'Mes commandes programmées, avec pagination.' })
  findAll(@Query() query: FindScheduledOrdersQueryDto, @Request() req) {
    return this.scheduledOrdersService.findAll(req.user.id, query.page, query.limit, query.status);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Détail de ma commande programmée (Étudiant propriétaire)' })
  @ApiResponse({ status: 200, type: ScheduledOrderEntity })
  @ApiResponse({ status: 404, description: 'Commande programmée introuvable.' })
  findOne(@Param('id') id: string, @Request() req) {
    return this.scheduledOrdersService.findOne(id, req.user.id);
  }

  @Post(':id/cancel')
  @ApiOperation({
    summary: 'Annuler ma commande programmée, sans motif, tant qu\'elle est en attente (Étudiant propriétaire)',
  })
  @ApiResponse({ status: 201, description: 'La commande programmée est annulée.', type: ScheduledOrderEntity })
  @ApiResponse({ status: 400, description: "La commande programmée n'est plus en attente." })
  @ApiResponse({ status: 404, description: 'Commande programmée introuvable.' })
  cancel(@Param('id') id: string, @Request() req) {
    return this.scheduledOrdersService.cancel(id, req.user.id);
  }
}
