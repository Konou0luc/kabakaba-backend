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
import { computeWithdrawalFees } from '../pricing/withdrawal-fees';

interface Actor {
  id: string;
  role?: UserRole;
  isAdmin?: boolean;
}

@Injectable()
export class WithdrawalsService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * CDC 5.3 — demande de retrait vendeur.
   * - Bloqué si créance active (debtFcfa > 0)
   * - Frais calculés serveur selon seuils 10k / 30k
   * - Débit atomique balanceFcfa (pattern gte, comme wallet.service)
   * - Withdrawal créé en PENDING (décaissement Mobile Money manuel côté Admin)
   */
  async request(dto: CreateWithdrawalDto, actor: Actor) {
    const amount = Number(dto.amount);
    if (!Number.isFinite(amount) || amount <= 0) {
      throw new BadRequestException('Montant de retrait invalide');
    }

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

    const fees = computeWithdrawalFees(amount);
    const totalDebit = amount + fees.vendorBorneTotal;

    return this.prisma.$transaction(async (tx) => {
      // Débit conditionnel atomique — même pattern que wallet.service.ts
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
          `Solde insuffisant. Requis : ${totalDebit} FCFA (montant ${amount} + frais ${fees.vendorBorneTotal}).`,
        );
      }

      const withdrawal = await tx.withdrawal.create({
        data: {
          vendorId: vendor.id,
          amount,
          platformFee: fees.platformFee,
          operatorFee: fees.operatorFee,
          status: WithdrawalStatus.PENDING,
        },
      });

      await tx.transaction.create({
        data: {
          userId: vendor.userId,
          type: 'WITHDRAWAL',
          status: 'COMPLETED',
          amount: totalDebit,
          reference: crypto.randomUUID(),
          description: `Demande de retrait ${amount} FCFA (frais vendeur ${fees.vendorBorneTotal} FCFA) — ${withdrawal.id}`,
        },
      });

      return {
        withdrawal,
        fees: {
          platformFee: fees.platformFee,
          operatorFee: fees.operatorFee,
          vendorBorneTotal: fees.vendorBorneTotal,
          platformCoveredTotal: fees.platformCoveredTotal,
          totalDebited: totalDebit,
        },
        message:
          fees.vendorBorneTotal > 0
            ? `Retrait enregistré. Frais à votre charge : ${fees.vendorBorneTotal} FCFA. Total débité : ${totalDebit} FCFA. Traitement manuel par l'équipe.`
            : `Retrait enregistré. Aucun frais à votre charge. Total débité : ${totalDebit} FCFA. Traitement manuel par l'équipe.`,
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
   * Passage PENDING → COMPLETED / FAILED réservé Admin (décaissement manuel).
   * COMPLETED : pas de mouvement de solde supplémentaire (déjà débité à la demande).
   * FAILED : recrédite amount + frais vendeur sur balanceFcfa.
   */
  async updateStatus(id: string, status: WithdrawalStatus, actor: Actor) {
    if (!actor.isAdmin && actor.role !== UserRole.ADMIN && actor.role !== UserRole.SUPER_ADMIN) {
      throw new ForbiddenException('Action réservée aux administrateurs');
    }

    if (status !== WithdrawalStatus.COMPLETED && status !== WithdrawalStatus.FAILED && status !== WithdrawalStatus.PROCESSING) {
      throw new BadRequestException('Statut cible non autorisé');
    }

    return this.prisma.$transaction(async (tx) => {
      const existing = await tx.withdrawal.findUnique({ where: { id } });
      if (!existing || existing.deletedAt) {
        throw new NotFoundException('Retrait introuvable');
      }
      if (existing.status === WithdrawalStatus.COMPLETED || existing.status === WithdrawalStatus.FAILED) {
        throw new BadRequestException(`Retrait déjà terminé (${existing.status})`);
      }

      if (status === WithdrawalStatus.FAILED) {
        const fees = computeWithdrawalFees(Number(existing.amount), Number(existing.platformFee), Number(existing.operatorFee));
        const refund = Number(existing.amount) + fees.vendorBorneTotal;
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

      return tx.withdrawal.update({
        where: { id },
        data: { status },
      });
    });
  }
}
