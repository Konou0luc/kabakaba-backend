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
import { PaymentsService } from '../services/payments.service';
import { CreatePaymentDto } from '../dto/create-payment.dto';
import { UpdatePaymentDto } from '../dto/update-payment.dto';
import { CreatePaymentIntentDto } from '../dto/create-payment-intent.dto';
import { InitiatePaymentDto } from '../dto/initiate-payment.dto';
import { PaymentEntity } from '../entities/payment.entity';
import { PaginationDto } from '../../../common/dto/pagination.dto';
import { Roles } from '../../../common/decorators/roles.decorator';
import { UserRole } from '@prisma/client';
import { JwtAuthGuard } from '../../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../../common/guards/roles.guard';
import { GetCurrentUserId } from '../../../common/decorators/get-current-user.decorator';

@ApiTags('Payments')
@Controller('payments')
export class PaymentsController {
  constructor(private readonly paymentsService: PaymentsService) {}

  @Post('intent')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.STUDENT)
  @ApiOperation({
    summary: 'Créer une intention de paiement (Étudiant seulement)',
  })
  @ApiResponse({
    status: 201,
    description: 'Intention de paiement créée avec succès.',
  })
  createPaymentIntent(
    @Body() createPaymentIntentDto: CreatePaymentIntentDto,
    @GetCurrentUserId() userId: string,
  ) {
    return this.paymentsService.createPaymentIntent(
      createPaymentIntentDto.amount,
      createPaymentIntentDto.ticketsReceived,
      createPaymentIntentDto.operator,
      userId,
    );
  }

  @Post(':id/initiate')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.STUDENT)
  @ApiOperation({
    summary: 'Initier un paiement Mobile Money (Étudiant seulement)',
  })
  @ApiResponse({
    status: 200,
    description: 'Paiement initié avec succès.',
  })
  initiatePayment(
    @Param('id') paymentId: string,
    @Body() initiatePaymentDto: InitiatePaymentDto,
  ) {
    return this.paymentsService.initiatePayment(
      paymentId,
      initiatePaymentDto.phoneNumber,
    );
  }

  @Post('webhook')
  @ApiOperation({
    summary: 'Webhook pour les notifications de statut de paiement FedaPay',
  })
  handleWebhook(@Body() webhookData: any) {
    return this.paymentsService.handleWebhook(webhookData);
  }

  @Post()
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.STUDENT)
  @ApiOperation({ summary: 'Créer un nouveau paiement (Étudiant seulement)' })
  @ApiResponse({
    status: 201,
    description: 'Le paiement a été créé avec succès.',
    type: PaymentEntity,
  })
  create(@Body() createPaymentDto: CreatePaymentDto, @Request() req) {
    return this.paymentsService.create(createPaymentDto, req.user.id);
  }

  @Get()
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN, UserRole.STUDENT)
  @ApiOperation({ summary: 'Récupérer tous les paiements actifs' })
  @ApiQuery({ type: PaginationDto })
  @ApiResponse({
    status: 200,
    description: 'Retourne tous les paiements actifs avec pagination.',
  })
  findAll(@Query() paginationDto: PaginationDto, @Request() req) {
    let userId: string | undefined;
    if (req.user.role === UserRole.STUDENT) userId = req.user.id;

    return this.paymentsService.findAll(
      paginationDto.page,
      paginationDto.limit,
      userId,
    );
  }

  @Get(':id')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN, UserRole.STUDENT)
  @ApiOperation({ summary: 'Récupérer un paiement actif' })
  @ApiResponse({ status: 200, description: 'Retourne le paiement.', type: PaymentEntity })
  @ApiResponse({ status: 404, description: 'Paiement introuvable.' })
  findOne(@Param('id') id: string) {
    return this.paymentsService.findOne(id);
  }

  @Patch(':id')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN)
  @ApiOperation({ summary: 'Mettre à jour un paiement (Admin seulement)' })
  @ApiResponse({
    status: 200,
    description: 'Le paiement a été mis à jour avec succès.',
    type: PaymentEntity,
  })
  update(@Param('id') id: string, @Body() updatePaymentDto: UpdatePaymentDto) {
    return this.paymentsService.update(id, updatePaymentDto);
  }

  @Delete(':id')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN)
  @ApiOperation({ summary: 'Supprimer un paiement (Admin seulement)' })
  @ApiResponse({
    status: 200,
    description: 'Le paiement a été supprimé avec succès.',
  })
  remove(@Param('id') id: string) {
    return this.paymentsService.remove(id);
  }
}
