import { Injectable, NotFoundException, BadRequestException, ForbiddenException, Logger } from '@nestjs/common';
import * as crypto from 'crypto';
import { PrismaService } from '../../../database/services/prisma.service';
import { CreatePaymentDto } from '../dto/create-payment.dto';
import { UpdatePaymentDto } from '../dto/update-payment.dto';
import { FedapayService } from './fedapay.service';
import { UsersService } from '../../users/services/users.service';
import { AmbassadorStatus, PaymentStatus, UserRole } from '@prisma/client';
import { computeRechargeAmountFcfa } from '../pricing/recharge-pricing';
import {
  COMMISSION_RATE_BY_LEVEL,
  computeCommissionTickets,
} from '../../ambassadors/pricing/ambassador-commission';

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

    const payment = await this.prisma.payment.findUnique({
      where: { fedapayReference: String(transactionId) },
    });

    if (!payment) {
      throw new NotFoundException('Paiement introuvable pour cette transaction');
    }

    let newStatus: PaymentStatus;
    switch (eventName) {
      case 'transaction.approved':
        newStatus = PaymentStatus.SUCCESS;
        break;
      case 'transaction.declined':
      case 'transaction.canceled':
        newStatus = PaymentStatus.FAILED;
        break;
      default:
        return { message: 'Événement non traité' };
    }

    if (newStatus === PaymentStatus.SUCCESS) {
      // Défense en profondeur : même si `amount` est désormais calculé
      // côté serveur (voir recharge-pricing.ts) et ne peut plus être
      // falsifié à la création, on vérifie en plus que le montant que
      // FedaPay confirme avoir réellement encaissé correspond bien au
      // montant qu'on attendait, avant de créditer le wallet.
      const confirmedAmount = webhookData?.entity?.amount;
      if (confirmedAmount === undefined || confirmedAmount === null) {
        // SÉCURITÉ : un montant absent n'est plus toléré/ignoré — pour un
        // événement financier, l'absence d'information n'autorise jamais
        // implicitement le crédit.
        this.logger.error(
          `Webhook FedaPay: montant absent du payload pour la transaction ${transactionId}. Crédit refusé.`,
        );
        throw new BadRequestException('Montant confirmé manquant dans le webhook FedaPay');
      }
      if (Number(confirmedAmount) !== Number(payment.amountFcfa)) {
        this.logger.error(
          `Webhook FedaPay: montant confirmé (${confirmedAmount}) ≠ montant attendu (${payment.amountFcfa}) pour la transaction ${transactionId}. Crédit refusé.`,
        );
        throw new BadRequestException('Montant confirmé par FedaPay incohérent avec le paiement attendu');
      }
    }

    // SÉCURITÉ : le claim ATOMIQUE de la transition PENDING -> newStatus et
    // le crédit du wallet doivent réussir ou échouer ENSEMBLE, dans une
    // seule transaction DB. Sans ça, un crash serveur entre les deux
    // laisserait le paiement bloqué à SUCCESS sans que le wallet n'ait
    // jamais été crédité — un webhook rejoué verrait alors "déjà traité"
    // et le crédit serait perdu définitivement.
    const result = await this.prisma.$transaction(async (tx) => {
      const claim = await tx.payment.updateMany({
        where: { id: payment.id, status: PaymentStatus.PENDING },
        data: { status: newStatus },
      });

      if (claim.count === 0) {
        return { alreadyProcessed: true };
      }

      if (newStatus === PaymentStatus.SUCCESS) {
        await tx.user.update({
          where: { id: payment.userId },
          data: { walletBalance: { increment: payment.ticketsReceived } },
        });

        // Avant ce correctif, aucune ligne de ce service ne créait de
        // Transaction pour les recharges : le wallet était bien crédité,
        // mais rien n'apparaissait jamais dans le grand livre (DEPOSIT).
        await tx.transaction.create({
          data: {
            userId: payment.userId,
            type: 'DEPOSIT',
            status: 'COMPLETED',
            amount: payment.ticketsReceived,
            reference: crypto.randomUUID(),
            description: `Recharge via ${payment.operator}`,
            relatedPaymentId: payment.id,
          },
        });

        // CDC 10.1 / 10.3 — commission ambassadeur sur recharge d'un affilié.
        // Même transaction Prisma que le crédit étudiant : tout réussit ou
        // tout échoue ensemble. Un ambassadeur SUSPENDED ne perçoit plus
        // de commission (CDC 10.5) ; les affiliés restent rattachés.
        const affiliate = await tx.ambassadorAffiliate.findUnique({
          where: { studentId: payment.userId },
          select: {
            id: true,
            ambassadorId: true,
            ambassador: {
              select: {
                id: true,
                userId: true,
                level: true,
                status: true,
              },
            },
          },
        });

        if (
          affiliate?.ambassador &&
          affiliate.ambassador.status === AmbassadorStatus.ACTIVE
        ) {
          const level = affiliate.ambassador.level;
          const rate = COMMISSION_RATE_BY_LEVEL[level];
          const commissionTickets = computeCommissionTickets(
            Number(payment.amountFcfa),
            level,
          );

          if (commissionTickets > 0) {
            await tx.ambassadorCommission.create({
              data: {
                ambassadorId: affiliate.ambassadorId,
                paymentId: payment.id,
                affiliateId: affiliate.id,
                amount: commissionTickets,
                commissionRate: rate,
                levelApplied: level,
              },
            });

            await tx.user.update({
              where: { id: affiliate.ambassador.userId },
              data: { walletBalance: { increment: commissionTickets } },
            });

            await tx.transaction.create({
              data: {
                userId: affiliate.ambassador.userId,
                type: 'AMBASSADOR_COMMISSION',
                status: 'COMPLETED',
                amount: commissionTickets,
                reference: crypto.randomUUID(),
                description: `Commission ambassadeur (${level}) — recharge affilié ${payment.id}`,
                relatedPaymentId: payment.id,
              },
            });
          }
        }
      }

      return { alreadyProcessed: false };
    });

    if (result.alreadyProcessed) {
      return { message: 'Paiement déjà traité, webhook ignoré' };
    }

    return { message: 'Webhook traité avec succès' };
  }

  async create(createPaymentDto: CreatePaymentDto, callerId: string) {
    // Réservé aux admins (voir @Roles sur le contrôleur). `userId` dans le
    // DTO permet de créditer un étudiant spécifique (ajustement manuel) ;
    // sans lui, le paiement serait créé pour l'admin lui-même, ce qui n'a
    // pas de sens pour ce cas d'usage.
    const { userId: targetUserId, ...paymentData } = createPaymentDto;
    return this.prisma.payment.create({
      data: {
        ...paymentData,
        userId: targetUserId || callerId,
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