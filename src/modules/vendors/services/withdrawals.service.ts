import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { UserRole, WithdrawalStatus } from '@prisma/client';
import * as crypto from 'crypto';
import { PrismaService } from '../../../database/services/prisma.service';
import { CreateWithdrawalDto } from '../dto/create-withdrawal.dto';
import {
  computeWithdrawalFees,
  MobileOperator,
} from '../pricing/withdrawal-fees';

interface Actor {
  id: string;
  role?: UserRole;
  isAdmin?: boolean;
}

@Injectable()
export class WithdrawalsService {
  constructor(private readonly prisma: PrismaService) {}

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

  async findAll(page = 1, limit = 10, status?: WithdrawalStatus) {
    const skip = (page - 1) * limit;
    const where = {
      deletedAt: null,
      ...(status ? { status } : {}),
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
  async updateStatus(id: string, status: WithdrawalStatus, actor: Actor) {
    if (!actor.isAdmin && actor.role !== UserRole.ADMIN && actor.role !== UserRole.SUPER_ADMIN) {
      throw new ForbiddenException('Action réservée aux administrateurs');
    }

    if (
      status !== WithdrawalStatus.COMPLETED &&
      status !== WithdrawalStatus.FAILED &&
      status !== WithdrawalStatus.PROCESSING
    ) {
      throw new BadRequestException('Statut cible non autorisé');
    }

    return this.prisma.$transaction(async (tx) => {
      const existing = await tx.withdrawal.findUnique({ where: { id } });
      if (!existing || existing.deletedAt) {
        throw new NotFoundException('Retrait introuvable');
      }
      if (
        existing.status === WithdrawalStatus.COMPLETED ||
        existing.status === WithdrawalStatus.FAILED
      ) {
        throw new BadRequestException(`Retrait déjà terminé (${existing.status})`);
      }

      if (status === WithdrawalStatus.FAILED) {
        // Montant réellement débité à la création — stocké explicitement
        // (debitedAmount), plus de reconstruction heuristique à partir des
        // paliers de frais.
        const refund = Number(existing.debitedAmount);

        await tx.vendor.update({
          where: { id: existing.vendorId },
          data: { balanceFcfa: { increment: refund } },
        });
        const vendor = await tx.vendor.findUnique({ where: { id: existing.vendorId } });
        if (vendor) {
          await tx.transaction.create({
            data: {
              userId: vendor.userId,
              type: 'REFUND',
              status: 'COMPLETED',
              amount: refund,
              reference: crypto.randomUUID(),
              description: `Annulation retrait ${existing.id} — solde recrédité`,
            },
          });
        }
      }

      // Miroir : la Transaction WITHDRAWAL créée dans request() reste
      // retrouvable via reference = withdrawal.id (voir commentaire
      // là-bas) — on la met à jour pour qu'elle reflète le vrai statut au
      // lieu de rester figée. TransactionStatus n'a pas de valeur
      // PROCESSING : le plus proche sémantiquement est PENDING ("pas encore
      // terminé").
      await tx.transaction.updateMany({
        where: { reference: existing.id, type: 'WITHDRAWAL' },
        data: { status: status === WithdrawalStatus.PROCESSING ? 'PENDING' : status },
      });

      return tx.withdrawal.update({
        where: { id },
        data: { status },
      });
    });
  }
}
