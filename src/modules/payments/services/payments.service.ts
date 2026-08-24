import { Injectable, NotFoundException, BadRequestException, ForbiddenException, Logger } from '@nestjs/common';
import { PrismaService } from '../../../database/services/prisma.service';
import { CreatePaymentDto } from '../dto/create-payment.dto';
import { UpdatePaymentDto } from '../dto/update-payment.dto';
import { FedapayService } from './fedapay.service';
import { UsersService } from '../../users/services/users.service';
import { PaymentStatus, UserRole } from '@prisma/client';
import { computeRechargeAmountFcfa } from '../pricing/recharge-pricing';

interface Actor {
  id: string;
  role: UserRole;
}

@Injectable()
export class PaymentsService {
  private readonly logger = new Logger(PaymentsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly fedapayService: FedapayService,
    private readonly usersService: UsersService,
  ) {}

  async createPaymentIntent(
    ticketsReceived: number,
    operator: string,
    userId: string,
  ) {
    const user = await this.usersService.findOne(userId);
    if (!user) throw new NotFoundException('Utilisateur introuvable');

    // SÉCURITÉ : le montant à payer est calculé UNIQUEMENT côté serveur à
    // partir du barème officiel — jamais fourni par le client. Voir
    // src/modules/payments/pricing/recharge-pricing.ts.
    const amount = computeRechargeAmountFcfa(ticketsReceived);

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

  async initiatePayment(paymentId: string, phoneNumber: string, actor: Actor) {
    const payment = await this.getPaymentOrThrow(paymentId);

    const isAdmin = actor.role === UserRole.ADMIN || actor.role === UserRole.SUPER_ADMIN;
    if (!isAdmin && payment.userId !== actor.id) {
      throw new ForbiddenException("Vous n'avez pas accès à ce paiement");
    }

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
      case 'transaction.approved': {
        // Défense en profondeur : même si `amount` est désormais calculé
        // côté serveur (voir recharge-pricing.ts) et ne peut plus être
        // falsifié à la création, on vérifie en plus que le montant que
        // FedaPay confirme avoir réellement encaissé correspond bien au
        // montant qu'on attendait, avant de créditer le wallet.
        const confirmedAmount = webhookData?.entity?.amount;
        if (
          confirmedAmount !== undefined &&
          confirmedAmount !== null &&
          Number(confirmedAmount) !== Number(payment.amountFcfa)
        ) {
          this.logger.error(
            `Webhook FedaPay: montant confirmé (${confirmedAmount}) ≠ montant attendu (${payment.amountFcfa}) pour la transaction ${transactionId}. Crédit refusé.`,
          );
          throw new BadRequestException('Montant confirmé par FedaPay incohérent avec le paiement attendu');
        }

        newStatus = PaymentStatus.SUCCESS;
        await this.prisma.user.update({
          where: { id: payment.userId },
          data: { walletBalance: { increment: payment.ticketsReceived } },
        });
        break;
      }
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

  private async getPaymentOrThrow(id: string) {
    const payment = await this.prisma.payment.findUnique({
      where: { id, deletedAt: null },
    });

    if (!payment) throw new NotFoundException(`Paiement avec l'identifiant ${id} introuvable`);

    return payment;
  }

  async findOne(id: string, actor: Actor) {
    const payment = await this.getPaymentOrThrow(id);

    const isAdmin = actor.role === UserRole.ADMIN || actor.role === UserRole.SUPER_ADMIN;
    if (!isAdmin && payment.userId !== actor.id) {
      throw new ForbiddenException("Vous n'avez pas accès à ce paiement");
    }

    return payment;
  }

  async update(id: string, updatePaymentDto: UpdatePaymentDto) {
    // Accessible uniquement à ADMIN/SUPER_ADMIN au niveau du contrôleur :
    // pas de contrôle d'ownership à appliquer ici.
    await this.getPaymentOrThrow(id);
    return this.prisma.payment.update({
      where: { id },
      data: updatePaymentDto,
    });
  }

  async remove(id: string) {
    await this.getPaymentOrThrow(id);
    return this.prisma.payment.update({
      where: { id },
      data: { deletedAt: new Date() },
    });
  }

}