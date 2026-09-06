import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { UserRole, WithdrawalStatus, WebUserRole } from '@prisma/client';
import * as crypto from 'crypto';
import { PrismaService } from '../../../database/services/prisma.service';
import { FedapayService } from '../../payments/services/fedapay.service';
import { CreateWithdrawalDto } from '../dto/create-withdrawal.dto';
import {
  computeWithdrawalFees,
  MobileOperator,
} from '../pricing/withdrawal-fees';

interface Actor {
  id: string;
  kind?: 'mobile' | 'web';
  role?: UserRole;
  isAdmin?: boolean;
}

@Injectable()
export class WithdrawalsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly fedapay: FedapayService,
  ) {}

  /**
   * Récapitulatif sans débit — écran mobile avant confirmation.
   */
  preview(amount: number, operator: MobileOperator) {
    if (!Number.isFinite(amount) || amount <= 0) {
      throw new BadRequestException('Montant de retrait invalide');
    }
    const fees = computeWithdrawalFees(amount, operator);
    return {
      tier: fees.tier,
      operator: fees.operator,
      amountRequested: fees.amountRequested,
      fedapayFee: fees.fedapayFee,
      cashOutFee: fees.cashOutFee,
      payoutAmountToSend: fees.payoutAmountToSend,
      debitedFromBalance: fees.debitedFromBalance,
      vendorBorneFedapayFee: fees.vendorBorneFedapayFee,
      platformCost: fees.platformCost,
      lines: fees.summaryLines,
    };
  }

  /**
   * Demande de retrait vendeur.
   * - Bloqué si créance active
   * - Frais : barèmes FedaPay + Flooz/Mixx + paliers Kabakaba 10k / 30k
   * - Débit atomique balanceFcfa
   * - Withdrawal PENDING (payout FedaPay à brancher / traité ensuite)
   */
  async request(dto: CreateWithdrawalDto, actor: Actor) {
    const amount = Number(dto.amount);
    if (!Number.isFinite(amount) || amount <= 0) {
      throw new BadRequestException('Montant de retrait invalide');
    }
    const operator = (dto.operator || 'MIXX') as MobileOperator;

    const vendor = await this.prisma.vendor.findUnique({
      where: { userId: actor.id },
    });
    if (!vendor || vendor.deletedAt) {
      throw new NotFoundException('Profil vendeur introuvable');
    }
    if (!vendor.isActive) {
      throw new ForbiddenException('Compte vendeur inactif — retrait impossible');
    }

    const debtFcfa = Number(vendor.debtFcfa);
    if (debtFcfa > 0) {
      throw new BadRequestException(
        `Vous avez une créance de ${debtFcfa} FCFA. Veuillez la régulariser avant de retirer.`,
      );
    }

    const fees = computeWithdrawalFees(amount, operator);
    const totalDebit = fees.debitedFromBalance;

    return this.prisma.$transaction(async (tx) => {
      const debit = await tx.vendor.updateMany({
        where: {
          id: vendor.id,
          debtFcfa: { lte: 0 },
          balanceFcfa: { gte: totalDebit },
        },
        data: {
          balanceFcfa: { decrement: totalDebit },
        },
      });

      if (debit.count === 0) {
        throw new BadRequestException(
          `Solde insuffisant. Requis : ${totalDebit} FCFA.`,
        );
      }

      // operatorFee = frais FedaPay ; platformFee = frais cash ajoutés (palier ≥30k)
      // debitedAmount = montant exact décrémenté ci-dessus, stocké explicitement
      // pour que updateStatus(FAILED) recrédite sans avoir à le recalculer.
      const withdrawal = await tx.withdrawal.create({
        data: {
          vendorId: vendor.id,
          amount,
          platformFee: fees.cashOutFee,
          operatorFee: fees.fedapayFee,
          debitedAmount: totalDebit,
          operator,
          payoutAmount: fees.payoutAmountToSend,
          status: WithdrawalStatus.PENDING,
        },
      });

      await tx.transaction.create({
        data: {
          userId: vendor.userId,
          type: 'WITHDRAWAL',
          // PENDING, pas COMPLETED : le retrait vient d'être créé, pas versé.
          // Le vrai statut vit sur Withdrawal — cette Transaction est mise à
          // jour en miroir dans updateStatus() ci-dessous, retrouvée via
          // reference = withdrawal.id (pas un UUID random déconnecté).
          status: 'PENDING',
          amount: totalDebit,
          reference: withdrawal.id,
          description:
            `Retrait ${amount} FCFA via ${operator} → payout ${fees.payoutAmountToSend} FCFA ` +
            `(FedaPay ${fees.fedapayFee}, cash ${fees.cashOutFee}) — ${withdrawal.id}`,
        },
      });

      return {
        withdrawal,
        recap: {
          tier: fees.tier,
          operator: fees.operator,
          amountRequested: fees.amountRequested,
          fedapayFee: fees.fedapayFee,
          cashOutFee: fees.cashOutFee,
          payoutAmountToSend: fees.payoutAmountToSend,
          debitedFromBalance: fees.debitedFromBalance,
          vendorBorneFedapayFee: fees.vendorBorneFedapayFee,
          platformCost: fees.platformCost,
          lines: fees.summaryLines,
        },
        message: fees.summaryLines.join(' '),
      };
    });
  }

  async findMine(actor: Actor, page = 1, limit = 10) {
    const vendor = await this.prisma.vendor.findUnique({
      where: { userId: actor.id },
    });
    if (!vendor) throw new NotFoundException('Profil vendeur introuvable');

    const skip = (page - 1) * limit;
    const where = { vendorId: vendor.id, deletedAt: null };
    const [total, data] = await this.prisma.$transaction([
      this.prisma.withdrawal.count({ where }),
      this.prisma.withdrawal.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
      }),
    ]);

    return {
      data,
      meta: { page, limit, total, totalPages: Math.ceil(total / limit) },
    };
  }

  // Agrégat par statut pour les KPI cards de la page Retraits (Admin) —
  // count + somme de debitedAmount (montant réellement débité du solde
  // vendeur, cf. commentaire sur ce champ plus haut), pas amount seul.
  async getStats() {
    const grouped = await this.prisma.withdrawal.groupBy({
      by: ['status'],
      where: { deletedAt: null },
      _count: true,
      _sum: { debitedAmount: true },
    });

    const byStatus = Object.fromEntries(
      grouped.map((g) => [g.status, { count: g._count, total: Number(g._sum.debitedAmount ?? 0) }]),
    );

    const zero = { count: 0, total: 0 };
    return {
      pending: byStatus.PENDING ?? zero,
      processing: byStatus.PROCESSING ?? zero,
      completed: byStatus.COMPLETED ?? zero,
      failed: byStatus.FAILED ?? zero,
    };
  }

  async findAll(page = 1, limit = 10, status?: WithdrawalStatus, from?: string, to?: string) {
    const skip = (page - 1) * limit;
    // Même logique que resolveRange() dans analytics.service.ts : bornes
    // incluses, `to` étendu à la fin de journée.
    let createdAt: { gte?: Date; lte?: Date } | undefined;
    if (from || to) {
      const until = to ? new Date(to) : new Date();
      until.setHours(23, 59, 59, 999);
      createdAt = { ...(from ? { gte: new Date(from) } : {}), lte: until };
    }
    const where = {
      deletedAt: null,
      ...(status ? { status } : {}),
      ...(createdAt ? { createdAt } : {}),
    };
    const [total, data] = await this.prisma.$transaction([
      this.prisma.withdrawal.count({ where }),
      this.prisma.withdrawal.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: {
          vendor: {
            select: {
              id: true,
              canteenName: true,
              userId: true,
              debtFcfa: true,
              balanceFcfa: true,
            },
          },
        },
      }),
    ]);

    return {
      data,
      meta: { page, limit, total, totalPages: Math.ceil(total / limit) },
    };
  }

  /**
   * Admin : PROCESSING | COMPLETED | FAILED.
   * FAILED : recrédite le montant débité (amount + frais vendeur éventuels).
   * COMPLETED : le payout FedaPay a été envoyé pour `payoutAmountToSend`
   * (à calculer à nouveau via computeWithdrawalFees si besoin côté admin).
   */
  private async assertAdmin(actor: Actor) {
    if (!actor.isAdmin && !(actor.kind === 'web' && actor.role === UserRole.ADMIN)) {
      throw new ForbiddenException('Action réservée aux administrateurs');
    }
  }

  private async failAndRefund(id: string) {
    return this.prisma.$transaction(async (tx) => {
      const existing = await tx.withdrawal.findUnique({ where: { id } });
      if (!existing || existing.deletedAt) throw new NotFoundException('Retrait introuvable');
      if (existing.status === WithdrawalStatus.FAILED) return existing;
      if (existing.status === WithdrawalStatus.COMPLETED) {
        throw new BadRequestException('Impossible d’échouer un retrait déjà complété');
      }

      const refund = Number(existing.debitedAmount);
      await tx.vendor.update({ where: { id: existing.vendorId }, data: { balanceFcfa: { increment: refund } } });
      const vendor = await tx.vendor.findUnique({ where: { id: existing.vendorId }, select: { userId: true } });
      if (vendor) {
        await tx.transaction.create({
          data: {
            userId: vendor.userId,
            type: 'REFUND',
            status: 'COMPLETED',
            amount: refund,
            reference: crypto.randomUUID(),
            description: `Échec payout ${existing.id} — solde recrédité`,
          },
        });
      }
      await tx.transaction.updateMany({
        where: { reference: existing.id, type: 'WITHDRAWAL' },
        data: { status: 'FAILED' },
      });
      return tx.withdrawal.update({ where: { id }, data: { status: WithdrawalStatus.FAILED } });
    });
  }

  /**
   * Lance un payout FedaPay de façon idempotente.
   * Le merchant_reference est l'ID interne du retrait : en cas de timeout
   * après création chez FedaPay, on retrouve le payout avant toute nouvelle
   * création, ce qui évite un double paiement.
   */
  async processPayout(id: string, actor: Actor) {
    await this.assertAdmin(actor);

    const claimed = await this.prisma.$transaction(async (tx) => {
      const withdrawal = await tx.withdrawal.findUnique({
        where: { id },
        include: { vendor: { include: { user: true } } },
      });
      if (!withdrawal || withdrawal.deletedAt) throw new NotFoundException('Retrait introuvable');
      if (withdrawal.status === WithdrawalStatus.COMPLETED) return withdrawal;
      if (withdrawal.status === WithdrawalStatus.FAILED) {
        throw new BadRequestException('Retrait déjà échoué');
      }
      if (withdrawal.status === WithdrawalStatus.PENDING) {
        await tx.withdrawal.updateMany({
          where: { id, status: WithdrawalStatus.PENDING },
          data: { status: WithdrawalStatus.PROCESSING, payoutRequestedAt: new Date() },
        });
      }
      return tx.withdrawal.findUnique({
        where: { id },
        include: { vendor: { include: { user: true } } },
      });
    });

    if (!claimed) throw new NotFoundException('Retrait introuvable');
    if (claimed.status === WithdrawalStatus.COMPLETED) return claimed;

    const user = claimed.vendor.user;
    if (!user.phone) throw new BadRequestException('Numéro Mobile Money du vendeur manquant');
    if (!claimed.operator || !claimed.payoutAmount) throw new BadRequestException('Informations payout incomplètes');

    // Rechercher d'abord par merchant_reference pour rendre le retry sûr.
    let payout = await this.fedapay.findPayoutByMerchantReference(claimed.id);
    if (!payout) {
      payout = await this.fedapay.createPayout({
        amount: Number(claimed.payoutAmount),
        operator: claimed.operator as 'FLOOZ' | 'MIXX',
        customer: {
          name: `${user.firstName ?? ''} ${user.lastName ?? ''}`.trim() || user.phone,
          email: user.email ?? undefined,
          phone: user.phone,
        },
        merchantReference: claimed.id,
      });
    }

    const payoutId = Number(payout?.id);
    if (!Number.isFinite(payoutId)) {
      throw new BadRequestException('Réponse FedaPay invalide : identifiant payout absent');
    }

    await this.prisma.withdrawal.update({
      where: { id },
      data: { payoutReference: String(payout.reference ?? payout.id) },
    });

    let result = payout;
    const currentStatus = String(payout.status ?? '').toLowerCase();
    if (currentStatus === 'pending') {
      result = await this.fedapay.startPayout(payoutId, user.phone);
    }

    return this.applyPayoutStatus(id, result);
  }

  /** Synchronise l'état réel d'un payout FedaPay sans permettre au dashboard
   * de choisir arbitrairement COMPLETED. */
  async syncPayout(id: string, actor: Actor) {
    await this.assertAdmin(actor);
    const withdrawal = await this.prisma.withdrawal.findUnique({ where: { id } });
    if (!withdrawal || withdrawal.deletedAt) throw new NotFoundException('Retrait introuvable');
    if (!withdrawal.payoutReference) throw new BadRequestException('Aucun payout FedaPay associé');
    const payout = await this.fedapay.findPayoutByMerchantReference(id);
    if (!payout) throw new NotFoundException('Payout FedaPay introuvable');
    return this.applyPayoutStatus(id, payout);
  }

  private async applyPayoutStatus(id: string, payout: any) {
    const status = String(payout?.status ?? '').toLowerCase();
    if (status === 'sent') {
      return this.prisma.$transaction(async (tx) => {
        const existing = await tx.withdrawal.findUnique({ where: { id } });
        if (!existing || existing.deletedAt) throw new NotFoundException('Retrait introuvable');
        if (existing.status === WithdrawalStatus.COMPLETED) return existing;
        await tx.transaction.updateMany({ where: { reference: id, type: 'WITHDRAWAL' }, data: { status: 'COMPLETED' } });
        return tx.withdrawal.update({ where: { id }, data: { status: WithdrawalStatus.COMPLETED, payoutCompletedAt: new Date() } });
      });
    }
    if (status === 'failed') return this.failAndRefund(id);
    return this.prisma.withdrawal.update({ where: { id }, data: { status: WithdrawalStatus.PROCESSING } });
  }

  async updateStatus(id: string, status: WithdrawalStatus, actor: Actor) {
    await this.assertAdmin(actor);
    if (status !== WithdrawalStatus.PROCESSING) {
      throw new BadRequestException(
        'Seul le démarrage du payout est autorisé manuellement. FAILED/COMPLETED viennent de FedaPay.',
      );
    }
    return this.processPayout(id, actor);
  }
}
