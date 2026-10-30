import { Injectable, NotFoundException, BadRequestException, ForbiddenException, Logger } from '@nestjs/common';
import * as crypto from 'crypto';
import { PrismaService } from '../../../database/services/prisma.service';
import { FedapayService } from './fedapay.service';
import { UsersService } from '../../users/services/users.service';
import { NotificationsService } from '../../notifications/services/notifications.service';
import { PaymentStatus, UserRole, NotificationType } from '@prisma/client';
import { REFERRAL_REWARD_TICKETS } from '../../referrals/referral.constants';
import {
  quoteRechargeFromAmountFcfa,
  quoteRechargeFromTickets,
} from '../pricing/recharge-pricing';

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
   * Récap sans paiement.
   * - ticketsDesired (recommandé) : 500 tickets → paie 600 (frais 100)
   * - amountFcfa : 600 FCFA → 500 tickets
   */
  previewRecharge(params: { amountFcfa?: number; ticketsDesired?: number }) {
    if (params.ticketsDesired != null) {
      return quoteRechargeFromTickets(params.ticketsDesired);
    }
    if (params.amountFcfa != null) {
      return quoteRechargeFromAmountFcfa(params.amountFcfa);
    }
    throw new BadRequestException('Indiquez ticketsDesired ou amountFcfa');
  }

  /**
   * Crée l’intention de paiement.
   * - Mode recommandé : ticketsReceived (tickets souhaités → montant = tickets + frais)
   * - Mode alternatif : amountFcfa (montant payé → tickets = montant − frais)
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

    if (params.ticketsReceived != null) {
      const quote = quoteRechargeFromTickets(params.ticketsReceived);
      amount = quote.amountFcfa;
      ticketsReceived = quote.ticketsReceived;
      feeFcfa = quote.feeFcfa;
      quoteLines = quote.summaryLines;
    } else if (params.amountFcfa != null) {
      const quote = quoteRechargeFromAmountFcfa(params.amountFcfa);
      amount = quote.amountFcfa;
      ticketsReceived = quote.ticketsReceived;
      feeFcfa = quote.feeFcfa;
      quoteLines = quote.summaryLines;
    } else {
      throw new BadRequestException('Indiquez ticketsReceived ou amountFcfa');
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
      { userId, ticketsReceived, feeFcfa, operator: params.operator },
      params.operator,
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

    // Ne pas marquer FAILED ici : une erreur FedaPay (réseau, numéro, mode)
    // doit laisser le paiement PENDING pour permettre un nouvel essai d’initiate.
    return this.fedapayService.initiateMobileMoneyPayment(
      payment.fedapayReference || '',
      phoneNumber,
      payment.operator,
    );
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
      // Ne pas renvoyer 404 à FedaPay (retries / bruit) — ignorer proprement.
      this.logger.warn(
        `Webhook FedaPay: aucun paiement local pour transaction ${transactionId}`,
      );
      return { message: 'Paiement inconnu — ignoré' };
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
          if (error?.code === 'P2002') return { applied: false, referrerId: null };
          throw error;
        }
      }

      const claim = await tx.payment.updateMany({
        where: { id: payment.id, status: PaymentStatus.PENDING },
        data: { status: newStatus },
      });
      if (claim.count === 0) return { applied: false, referrerId: null };

      let referrerId: string | null = null;

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

        // Parrainage (CDC 42) : première recharge réussie du filleul. La mise
        // à jour conditionnelle (rewardedAt nul -> renseigné) ne réussit
        // qu'une fois par filleul, même avec des webhooks rejoués ou une
        // deuxième recharge : seul le cas count === 1 verse la récompense.
        const referralClaim = await tx.referral.updateMany({
          where: { refereeId: payment.userId, rewardedAt: null },
          data: {
            rewardedAt: new Date(),
            rewardTickets: REFERRAL_REWARD_TICKETS,
          },
        });
        if (referralClaim.count === 1) {
          const referral = await tx.referral.findUniqueOrThrow({
            where: { refereeId: payment.userId },
            select: { referrerId: true },
          });
          await tx.user.update({
            where: { id: referral.referrerId },
            data: { walletBalance: { increment: REFERRAL_REWARD_TICKETS } },
          });
          await tx.transaction.create({
            data: {
              userId: referral.referrerId,
              type: 'REFERRAL_BONUS',
              status: 'COMPLETED',
              amount: REFERRAL_REWARD_TICKETS,
              reference: crypto.randomUUID(),
              description: 'Bonus de parrainage',
            },
          });
          referrerId = referral.referrerId;
        }
      }

      if (opts?.providerEventKey) {
        await tx.paymentWebhookEvent.update({
          where: { providerEventKey: opts.providerEventKey },
          data: { processedAt: new Date() },
        });
      }

      return { applied: true, referrerId };
    });

    if (result.applied) {
      await this.notifyRecharge(payment.userId, newStatus, payment.ticketsReceived);
      if (result.referrerId) {
        await this.notifyReferralBonus(result.referrerId);
      }
    }
    return result.applied;
  }

  // Après le commit : un échec de notification ne doit jamais annuler la
  // récompense déjà versée.
  private async notifyReferralBonus(referrerId: string) {
    try {
      await this.notifications.notifyUser(
        referrerId,
        'Bonus de parrainage',
        `${REFERRAL_REWARD_TICKETS} tickets ont été ajoutés à ton portefeuille : ton filleul vient de faire sa première recharge.`,
        NotificationType.SUCCESS,
      );
    } catch (error) {
      this.logger.error(
        `Notif bonus de parrainage impossible user=${referrerId}`,
        error instanceof Error ? error.stack : error,
      );
    }
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
      const rawStatus = tx?.status;
      const status = String(
        typeof rawStatus === 'object' && rawStatus != null
          ? rawStatus.name || rawStatus.status || rawStatus
          : rawStatus ?? '',
      ).toLowerCase();

      this.logger.debug(
        `Sync FedaPay payment=${payment.id} ref=${payment.fedapayReference} status=${status}`,
      );

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
        const errCode = tx?.last_error_code || tx?.lastErrorCode || null;
        this.logger.warn(
          `FedaPay a refusé payment=${payment.id} status=${status} last_error_code=${errCode}`,
        );
        await this.applyPaymentOutcome(payment, PaymentStatus.FAILED);
      }
      // pending / sent / transferred / etc. → on laisse PENDING
    } catch (error) {
      this.logger.warn(
        `Sync FedaPay impossible payment=${payment.id}: ${
          error instanceof Error ? error.message : error
        }`,
      );
    }
  }

  /**
   * Phrase pour l’étudiant. Le code FedaPay reste dans les logs, jamais dans ce texte.
   */
  explainFedapayError(code: string | null | undefined, operator?: string): string | null {
    if (!code) return null;
    const c = String(code)
      .trim()
      .toUpperCase()
      .replace(/[\s-]+/g, '_');
    if (!c || c === 'NO_ERROR' || c === 'NONE' || c === 'NULL') return null;

    if (c.includes('PIN') || c.includes('SECRET')) {
      return 'Code secret incorrect. Réessaie avec le bon code.';
    }
    if (c === 'ACCOUNT_NOT_FOUND' || c === 'CUSTOMER_NOT_FOUND') {
      return operator === 'MIXX'
        ? 'Ce numéro n’a pas de compte Mixx. Essaie Flooz si c’est un numéro Moov.'
        : 'Ce numéro n’a pas de compte Flooz. Essaie Mixx si c’est un numéro Yas.';
    }
    if (c.includes('INSUFFICIENT') || c.includes('BALANCE')) {
      return 'Solde Mobile Money insuffisant.';
    }
    if (c.includes('CANCEL')) {
      return 'Paiement annulé sur le téléphone.';
    }
    if (c.includes('TIMEOUT') || c.includes('EXPIRED')) {
      return 'Délai dépassé. Tu n’as pas validé la demande à temps.';
    }
    if (c.includes('LIMIT') || c.includes('MAX_AMOUNT') || c.includes('MIN_AMOUNT')) {
      return 'Ce montant dépasse la limite de ton compte Mobile Money.';
    }
    if (c.includes('BLOCK') || c.includes('LOCK') || c.includes('SUSPEND')) {
      return 'Ce compte Mobile Money est bloqué. Contacte ton opérateur.';
    }
    return 'Paiement refusé. Vérifie ton numéro et valide la demande sur ton téléphone.';
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
    let payment = await this.getPaymentOrThrow(id);

    const isAdmin = actor.kind === 'web' && actor.role === 'ADMIN';
    if (!isAdmin && payment.userId !== actor.id) {
      throw new ForbiddenException("Vous n'avez pas accès à ce paiement");
    }

    if (payment.status === PaymentStatus.PENDING && payment.fedapayReference) {
      await this.syncPendingFromFedapay(payment);
      payment = await this.getPaymentOrThrow(id);
    }

    // Enrichit FAILED avec la raison FedaPay (ex. ACCOUNT_NOT_FOUND).
    if (payment.status === PaymentStatus.FAILED && payment.fedapayReference) {
      try {
        const data = await this.fedapayService.getTransaction(
          payment.fedapayReference,
        );
        const tx = data?.transaction ?? data?.['v1/transaction'] ?? data;
        const errCode = tx?.last_error_code || tx?.lastErrorCode || null;
        const failureReason = this.explainFedapayError(
          errCode,
          payment.operator,
        );
        return {
          ...payment,
          fedapayErrorCode: errCode,
          failureReason,
        };
      } catch {
        /* ignore */
      }
    }

    return payment;
  }

}