import { Injectable, NotFoundException, BadRequestException, Logger } from '@nestjs/common';
import { PrismaService } from '../../../database/services/prisma.service';
import { CreatePaymentDto } from '../dto/create-payment.dto';
import { UpdatePaymentDto } from '../dto/update-payment.dto';
import { FedapayService } from './fedapay.service';
import { UsersService } from '../../users/services/users.service';
import { PaymentStatus } from '@prisma/client';

@Injectable()
export class PaymentsService {
  private readonly logger = new Logger(PaymentsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly fedapayService: FedapayService,
    private readonly usersService: UsersService,
  ) {}

  async createPaymentIntent(
    amount: number,
    ticketsReceived: number,
    operator: string,
    userId: string,
  ) {
    const user = await this.usersService.findOne(userId);
    if (!user) throw new NotFoundException('Utilisateur introuvable');

    const fedapayTransaction = await this.fedapayService.createTransaction(
      amount,
      'XOF',
      'Rechargement de portefeuille Kabakaba',
      {
        name: `${user.firstName} ${user.lastName}`,
        email: user.email || undefined,
        phone: user.phone || undefined,
      },
      { userId, ticketsReceived },
    );

    const payment = await this.prisma.payment.create({
      data: {
        userId,
        operator: operator as any,
        amountFcfa: amount,
        ticketsReceived,
        fedapayReference: fedapayTransaction.transaction.id || '',
        status: PaymentStatus.PENDING,
      },
    });

    return { payment, fedapayTransaction };
  }

  async initiatePayment(paymentId: string, phoneNumber: string) {
    const payment = await this.findOne(paymentId);
    if (payment.status !== PaymentStatus.PENDING) {
      throw new BadRequestException('Paiement déjà initié ou traité');
    }

    const fedapayPayment = await this.fedapayService.initiateMobileMoneyPayment(
      payment.fedapayReference || '',
      phoneNumber,
      payment.operator,
    );

    return fedapayPayment;
  }

  async handleWebhook(rawBody: string, signatureHeader?: string) {
    // 1. Vérifie que la requête vient bien de FedaPay
    this.fedapayService.verifyWebhookSignature(rawBody, signatureHeader);

    // 2. Parse le payload (FedaPay envoie { name: "transaction.xxx", entity: {...} })
    let webhookData: any;
    try {
      webhookData = JSON.parse(rawBody);
    } catch {
      throw new BadRequestException('Payload de webhook invalide (JSON malformé)');
    }

    const eventName: string = webhookData?.name;
    const transactionId = webhookData?.entity?.id;

    this.logger.log(`Webhook FedaPay reçu: ${eventName} (transaction ${transactionId})`);

    if (!eventName || !transactionId) {
      throw new BadRequestException('Données de webhook invalides');
    }

    const payment = await this.prisma.payment.findFirst({
      where: { fedapayReference: String(transactionId) },
    });

    if (!payment) {
      throw new NotFoundException('Paiement introuvable pour cette transaction');
    }

    // Idempotence : FedaPay peut renvoyer le même webhook plusieurs fois
    if (payment.status !== PaymentStatus.PENDING) {
      return { message: 'Paiement déjà traité, webhook ignoré' };
    }

    let newStatus: PaymentStatus;
    switch (eventName) {
      case 'transaction.approved':
        newStatus = PaymentStatus.SUCCESS;
        await this.prisma.user.update({
          where: { id: payment.userId },
          data: { walletBalance: { increment: payment.ticketsReceived } },
        });
        break;
      case 'transaction.declined':
      case 'transaction.canceled':
        newStatus = PaymentStatus.FAILED;
        break;
      default:
        return { message: 'Événement non traité' };
    }

    await this.prisma.payment.update({
      where: { id: payment.id },
      data: { status: newStatus },
    });

    return { message: 'Webhook traité avec succès' };
  }

  async create(createPaymentDto: CreatePaymentDto, userId: string) {
    return this.prisma.payment.create({
      data: {
        ...createPaymentDto,
        userId,
      },
    });
  }

  async findAll(page: number = 1, limit: number = 10, userId?: string) {
    const skip = (page - 1) * limit;
    const where = {
      deletedAt: null,
      ...(userId ? { userId } : {}),
    };
    const [total, data] = await this.prisma.$transaction([
      this.prisma.payment.count({ where }),
      this.prisma.payment.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
      }),
    ]);

    return {
      data,
      meta: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  async findOne(id: string) {
    const payment = await this.prisma.payment.findUnique({
      where: { id, deletedAt: null },
    });

    if (!payment) throw new NotFoundException(`Paiement avec l'identifiant ${id} introuvable`);

    return payment;
  }

  async update(id: string, updatePaymentDto: UpdatePaymentDto) {
    await this.findOne(id);
    return this.prisma.payment.update({
      where: { id },
      data: updatePaymentDto,
    });
  }

  async remove(id: string) {
    await this.findOne(id);
    return this.prisma.payment.update({
      where: { id },
      data: { deletedAt: new Date() },
    });
  }

}