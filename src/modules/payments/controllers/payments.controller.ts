import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Query,
  UseGuards,
  Request,
  Req,
  Headers,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiQuery,
} from '@nestjs/swagger';
import { SkipThrottle, Throttle } from '@nestjs/throttler';
import { PaymentsService } from '../services/payments.service';
import { CreatePaymentIntentDto, PreviewRechargeDto } from '../dto/create-payment-intent.dto';
import { InitiatePaymentDto } from '../dto/initiate-payment.dto';
import { PaymentEntity } from '../entities/payment.entity';
import { PaginationDto } from '../../../common/dto/pagination.dto';
import { Roles } from '../../../common/decorators/roles.decorator';
import { WebRoles } from '../../../common/decorators/web-roles.decorator';
import { UserRole, WebUserRole } from '@prisma/client';
import { JwtAuthGuard } from '../../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../../common/guards/roles.guard';
import { CombinedJwtAuthGuard } from '../../../common/guards/combined-jwt-auth.guard';
import { CombinedRolesGuard } from '../../../common/guards/combined-roles.guard';
import { GetCurrentUserId } from '../../../common/decorators/get-current-user.decorator';

@ApiTags('Payments')
@Controller('payments')
export class PaymentsController {
  constructor(
    private readonly paymentsService: PaymentsService,
  ) {}

  @Post('preview')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.STUDENT)
  @ApiOperation({
    summary: 'Récap recharge (sans paiement)',
    description:
      'Préférer ticketsDesired : 500 tickets → paie 600 FCFA (frais 100). ' +
      'Ou amountFcfa : 600 FCFA → 500 tickets.',
  })
  previewRecharge(@Body() dto: PreviewRechargeDto) {
    return this.paymentsService.previewRecharge({
      ticketsDesired: dto.ticketsDesired,
      amountFcfa: dto.amountFcfa,
    });
  }

  @Post('intent')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.STUDENT)
  @ApiOperation({
    summary: 'Créer une intention de paiement (Étudiant)',
    description:
      'Préférer ticketsReceived (tickets souhaités). amountFcfa reste accepté.',
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
      {
        amountFcfa: createPaymentIntentDto.amountFcfa,
        ticketsReceived: createPaymentIntentDto.ticketsReceived,
        operator: createPaymentIntentDto.operator,
      },
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
    @Request() req,
  ) {
    return this.paymentsService.initiatePayment(
      paymentId,
      initiatePaymentDto.phoneNumber,
      { id: req.user.id, role: req.user.role, kind: req.user.__authKind === 'web' ? 'web' : 'mobile' },
    );
  }

  @SkipThrottle()
  @Post('webhook')
  @ApiOperation({
    summary: 'Webhook pour les notifications de statut de paiement FedaPay',
  })
  handleWebhook(
    @Req() req: any,
    @Headers('x-fedapay-signature') signature: string,
  ) {
    const rawBody = req.rawBody
      ? req.rawBody.toString('utf8')
      : JSON.stringify(req.body);
    return this.paymentsService.handleWebhook(rawBody, signature);
  }

  @Get()
  @ApiBearerAuth()
  @UseGuards(CombinedJwtAuthGuard, CombinedRolesGuard)
  @Roles(UserRole.ADMIN, UserRole.STUDENT)
  @WebRoles(WebUserRole.ADMIN, WebUserRole.SUPERVISION)
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

  /** Poll client : plus permissif que la limite globale (évite 429 pendant l’attente MM). */
  @Throttle({ default: { limit: 120, ttl: 60000 } })
  @Get(':id')
  @ApiBearerAuth()
  @UseGuards(CombinedJwtAuthGuard, CombinedRolesGuard)
  @Roles(UserRole.ADMIN, UserRole.STUDENT)
  @WebRoles(WebUserRole.ADMIN, WebUserRole.SUPERVISION)
  @ApiOperation({ summary: 'Récupérer un paiement actif' })
  @ApiResponse({ status: 200, description: 'Retourne le paiement.', type: PaymentEntity })
  @ApiResponse({ status: 404, description: 'Paiement introuvable.' })
  findOne(@Param('id') id: string, @Request() req) {
    return this.paymentsService.findOne(id, { id: req.user.id, role: req.user.role, kind: req.user.__authKind === 'web' ? 'web' : 'mobile' });
  }

}