import { Injectable, NotFoundException, BadRequestException, ForbiddenException, Logger } from '@nestjs/common';
import * as crypto from 'crypto';
import { PrismaService } from '../../../database/services/prisma.service';
import { FedapayService } from './fedapay.service';
import { UsersService } from '../../users/services/users.service';
import { NotificationsService } from '../../notifications/services/notifications.service';
import { AmbassadorStatus, PaymentStatus, UserRole, NotificationType } from '@prisma/client';
import {
  computeRechargeAmountFcfa,
  quoteRechargeFromAmountFcfa,
} from '../pricing/recharge-pricing';
import {
  COMMISSION_RATE_BY_LEVEL,
  computeCommissionTickets,
} from '../../ambassadors/pricing/ambassador-commission';

interface Actor {
  id: string;
  kind: 'mobile' | 'web';
  role: UserRole | string;
}

@Injectable()
export class PaymentsService {
  private readonly logger = new Logger(PaymentsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly fedapayService: FedapayService,
    private readonly usersService: UsersService,
    private readonly notifications: NotificationsService,
  ) {}

  /**
   * Récap mobile : montant FCFA saisi → tickets + frais inclus (sans créer de paiement).
   */
  previewRecharge(amountFcfa: number) {
    return quoteRechargeFromAmountFcfa(amountFcfa);
  }

  /**
   * Crée l’intention de paiement.
   * - Mode recommandé : amountFcfa (ce que l’étudiant paie, frais inclus)
   * - Mode legacy : ticketsReceived (on recalcule le montant à payer)
   */
  async createPaymentIntent(
    params: { amountFcfa?: number; ticketsReceived?: number; operator: string },
    userId: string,
  ) {
    const user = await this.usersService.findOne(userId);
    if (!user) throw new NotFoundException('Utilisateur introuvable');

    let amount: number;
    let ticketsReceived: number;
    let feeFcfa: number;
    let quoteLines: string[];

    if (params.amountFcfa != null) {
      // UX mobile : l’étudiant saisit ce qu’il paie ; tickets dérivés serveur.
      const quote = quoteRechargeFromAmountFcfa(params.amountFcfa);
      amount = quote.amountFcfa;
      ticketsReceived = quote.ticketsReceived;
      feeFcfa = quote.feeFcfa;
      quoteLines = quote.summaryLines;
    } else if (params.ticketsReceived != null) {
      ticketsReceived = params.ticketsReceived;
      amount = computeRechargeAmountFcfa(ticketsReceived);
      feeFcfa = amount - ticketsReceived;
      quoteLines = [
        `Vous payez : ${amount} FCFA`,
        `Frais de service (inclus) : ${feeFcfa} FCFA`,
        `Tickets crédités : ${ticketsReceived}`,
      ];
    } else {
      throw new BadRequestException('Indiquez amountFcfa ou ticketsReceived');
    }

    const fedapayTransaction = await this.fedapayService.createTransaction(
      amount,
      'XOF',
      'Rechargement de portefeuille Kabakaba',
      {
        name: `${user.firstName} ${user.lastName}`,
        email: user.email || undefined,
        phone: user.phone || undefined,
      },
      { userId, ticketsReceived, feeFcfa },
    );

    const payment = await this.prisma.payment.create({
      data: {
        userId,
        operator: params.operator as any,
        amountFcfa: amount,
        ticketsReceived,
        fedapayReference: String(fedapayTransaction.transaction?.id ?? ''),
        status: PaymentStatus.PENDING,
      },
    });

    return {
      payment,
      fedapayTransaction,
      recap: {
        amountFcfa: amount,
        ticketsReceived,
        feeFcfa,
        lines: quoteLines,
      },
    };
  }

  async initiatePayment(paymentId: string, phoneNumber: string, actor: Actor) {
    const payment = await this.getPaymentOrThrow(paymentId);

    const isAdmin = actor.kind === 'web' && actor.role === 'ADMIN';
    if (!isAdmin && payment.userId !== actor.id) {
      throw new ForbiddenException("Vous n'avez pas accès à ce paiement");
    }

    if (payment.status !== PaymentStatus.PENDING) {
      throw new BadRequestException('Paiement déjà initié ou traité');
    }

    try {
      return await this.fedapayService.initiateMobileMoneyPayment(
        payment.fedapayReference || '',
        phoneNumber,
        payment.operator,
      );
    } catch (error) {
      try {
        await this.applyPaymentOutcome(payment, PaymentStatus.FAILED);
      } catch (notifyError) {
        this.logger.error(
          `Marquage échec recharge impossible payment=${payment.id}`,
          notifyError instanceof Error ? notifyError.stack : notifyError,
        );
      }
      throw error;
    }
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
      case 'transaction.failed':
        newStatus = PaymentStatus.FAILED;
        break;
      default:
        return { message: 'Événement non traité' };
    }

    if (newStatus === PaymentStatus.SUCCESS) {
      const confirmedAmount = webhookData?.entity?.amount;
      if (confirmedAmount === undefined || confirmedAmount === null) {
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

    const applied = await this.applyPaymentOutcome(payment, newStatus, {
      providerEventKey: `${transactionId}:${eventName}`,
      eventName,
      confirmedAmount:
        newStatus === PaymentStatus.SUCCESS
          ? Number(webhookData?.entity?.amount)
          : undefined,
    });

    return {
      message: applied
        ? 'Webhook traité avec succès'
        : 'Paiement déjà traité, webhook ignoré',
    };
  }

  private async applyPaymentOutcome(
    payment: {
      id: string;
      userId: string;
      amountFcfa: unknown;
      ticketsReceived: number;
      operator: string;
    },
    newStatus: PaymentStatus,
    opts?: {
      providerEventKey?: string;
      eventName?: string;
      confirmedAmount?: number;
    },
  ): Promise<boolean> {
    if (newStatus === PaymentStatus.SUCCESS) {
      const confirmedAmount = opts?.confirmedAmount;
      if (confirmedAmount === undefined || Number.isNaN(Number(confirmedAmount))) {
        this.logger.error(
          `Crédit refusé: montant FedaPay absent pour payment=${payment.id}`,
        );
        return false;
      }
      if (Number(confirmedAmount) !== Number(payment.amountFcfa)) {
        this.logger.error(
          `Crédit refusé: montant FedaPay (${confirmedAmount}) ≠ attendu (${payment.amountFcfa}) payment=${payment.id}`,
        );
        return false;
      }
    }

    const result = await this.prisma.$transaction(async (tx) => {
      if (opts?.providerEventKey && opts.eventName) {
        try {
          await tx.paymentWebhookEvent.create({
            data: {
              providerEventKey: opts.providerEventKey,
              paymentId: payment.id,
              eventName: opts.eventName,
            },
          });
        } catch (error: any) {
          if (error?.code === 'P2002') return { applied: false };
          throw error;
        }
      }

      const claim = await tx.payment.updateMany({
        where: { id: payment.id, status: PaymentStatus.PENDING },
        data: { status: newStatus },
      });
      if (claim.count === 0) return { applied: false };

      if (newStatus === PaymentStatus.SUCCESS) {
        await tx.user.update({
          where: { id: payment.userId },
          data: { walletBalance: { increment: payment.ticketsReceived } },
        });

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

      if (opts?.providerEventKey) {
        await tx.paymentWebhookEvent.update({
          where: { providerEventKey: opts.providerEventKey },
          data: { processedAt: new Date() },
        });
      }

      return { applied: true };
    });

    if (result.applied) {
      await this.notifyRecharge(payment.userId, newStatus, payment.ticketsReceived);
    }
    return result.applied;
  }

  private async notifyRecharge(
    userId: string,
    status: PaymentStatus,
    ticketsReceived: number,
  ) {
    try {
      if (status === PaymentStatus.SUCCESS) {
        await this.notifications.notifyUser(
          userId,
          'Recharge réussie',
          `${ticketsReceived} tickets ont été ajoutés à ton portefeuille.`,
          NotificationType.SUCCESS,
        );
      } else if (status === PaymentStatus.FAILED) {
        await this.notifications.notifyUser(
          userId,
          'Recharge échouée',
          'Le paiement Mobile Money n’a pas abouti. Tes tickets n’ont pas été débités. Tu peux réessayer.',
          NotificationType.ERROR,
        );
      }
    } catch (error) {
      this.logger.error(
        `Notif recharge impossible user=${userId}`,
        error instanceof Error ? error.stack : error,
      );
    }
  }

  private async syncPendingFromFedapay(payment: {
    id: string;
    userId: string;
    amountFcfa: unknown;
    ticketsReceived: number;
    operator: string;
    fedapayReference: string | null;
  }) {
    if (!payment.fedapayReference) return;
    try {
      const data = await this.fedapayService.getTransaction(payment.fedapayReference);
      const tx = data?.transaction ?? data?.['v1/transaction'] ?? data;
      const status = String(tx?.status ?? '').toLowerCase();
      if (status === 'approved') {
        await this.applyPaymentOutcome(payment, PaymentStatus.SUCCESS, {
          confirmedAmount: Number(tx?.amount),
        });
      } else if (
        status === 'declined' ||
        status === 'canceled' ||
        status === 'cancelled' ||
        status === 'failed' ||
        status === 'expired'
      ) {
        await this.applyPaymentOutcome(payment, PaymentStatus.FAILED);
      }
    } catch (error) {
      this.logger.warn(
        `Sync FedaPay impossible payment=${payment.id}: ${
          error instanceof Error ? error.message : error
        }`,
      );
    }
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

    const isAdmin = actor.kind === 'web' && actor.role === 'ADMIN';
    if (!isAdmin && payment.userId !== actor.id) {
      throw new ForbiddenException("Vous n'avez pas accès à ce paiement");
    }

    if (payment.status === PaymentStatus.PENDING && payment.fedapayReference) {
      await this.syncPendingFromFedapay(payment);
      return this.getPaymentOrThrow(id);
    }

    return payment;
  }

}