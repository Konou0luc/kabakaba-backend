import { ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { DisputeStatus, DisputeDecision, TransactionType, TransactionStatus, UserRole } from '@prisma/client';
import { PrismaService } from '../../../database/services/prisma.service';
import { CreateDisputeDto } from '../dto/create-dispute.dto';
import { UpdateDisputeDto } from '../dto/update-dispute.dto';

@Injectable()
export class DisputesService {
  constructor(private readonly prisma: PrismaService) {}

  async create(createDisputeDto: CreateDisputeDto, requesterId: string, requesterRole: UserRole) {
    const order = await this.prisma.order.findUnique({
      where: { id: createDisputeDto.orderId, deletedAt: null },
    });
    if (!order) {
      throw new NotFoundException(`Commande avec l'identifiant ${createDisputeDto.orderId} introuvable`);
    }

    if (requesterRole === UserRole.STUDENT && order.studentId !== requesterId) {
      throw new ForbiddenException('Vous ne pouvez contester que vos propres commandes');
    }

    if (requesterRole === UserRole.VENDOR) {
      const vendor = await this.prisma.vendor.findUnique({ where: { userId: requesterId } });
      if (!vendor || vendor.id !== order.vendorId) {
        throw new ForbiddenException('Vous ne pouvez contester que des commandes qui vous concernent');
      }
    }

    return this.prisma.dispute.create({
      data: {
        orderId: order.id,
        studentId: order.studentId,
        vendorId: order.vendorId,
        reason: createDisputeDto.reason,
        ticketAmount: createDisputeDto.ticketAmount,
      },
    });
  }

  async findAll(
    page: number = 1,
    limit: number = 10,
    status?: DisputeStatus,
    vendorId?: string,
    studentId?: string,
    orderId?: string,
  ) {
    const skip = (page - 1) * limit;
    const where = {
      ...(status ? { status } : {}),
      ...(vendorId ? { vendorId } : {}),
      ...(studentId ? { studentId } : {}),
      ...(orderId ? { orderId } : {}),
    };

    const [total, data] = await this.prisma.$transaction([
      this.prisma.dispute.count({ where }),
      this.prisma.dispute.findMany({
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

  async findVendorIdByUserId(userId: string): Promise<string | null> {
    const vendor = await this.prisma.vendor.findUnique({ where: { userId } });
    return vendor?.id ?? null;
  }

  async findOne(id: string, requesterId?: string, requesterRole?: UserRole) {
    const dispute = await this.prisma.dispute.findUnique({ where: { id } });
    if (!dispute) throw new NotFoundException(`Litige avec l'identifiant ${id} introuvable`);

    if (requesterRole === UserRole.STUDENT && dispute.studentId !== requesterId) {
      throw new ForbiddenException('Accès refusé à ce litige');
    }

    if (requesterRole === UserRole.VENDOR) {
      const vendor = await this.prisma.vendor.findUnique({ where: { userId: requesterId } });
      if (!vendor || vendor.id !== dispute.vendorId) {
        throw new ForbiddenException('Accès refusé à ce litige');
      }
    }

    return dispute;
  }

  /**
   * Traite la décision d'un litige.
   *
   * REFUND est automatisé : la maquette (LitigeDetail.jsx) donne un montant
   * explicite et un langage de "débit immédiat" — le mouvement d'argent est
   * mécanique et non ambigu, donc on l'exécute dans la même transaction DB
   * que la mise à jour du litige. Si le solde vendeur est insuffisant, la
   * plateforme avance la différence : elle est enregistrée comme dette du
   * vendeur (Vendor.debtFcfa), pas laissée orpheline — la maquette dit
   * explicitement "la plateforme avance", ce qui implique une créance à
   * recouvrer, pas un cadeau.
   *
   * SUSPENSION_ADJUSTMENT n'est PAS automatisé : contrairement au
   * remboursement, ni le sens (lever/prolonger une suspension) ni la durée
   * ne sont fournis par cette décision seule. Deviner reviendrait à inventer
   * une règle métier. L'admin applique le changement via PATCH /users/:id
   * (déjà disponible) et documente son geste dans decisionNote.
   */
  async update(id: string, updateDisputeDto: UpdateDisputeDto) {
    const existing = await this.prisma.dispute.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException(`Litige avec l'identifiant ${id} introuvable`);

    if (existing.decision && updateDisputeDto.decision && updateDisputeDto.decision !== existing.decision) {
      throw new ConflictException(
        `Ce litige a déjà une décision (${existing.decision}) — une décision de litige est définitive et ne peut pas être changée`,
      );
    }

    const resolvedAt =
      updateDisputeDto.status === DisputeStatus.RESOLVED && !existing.resolvedAt ? new Date() : undefined;

    const isNewRefund = updateDisputeDto.decision === DisputeDecision.REFUND && !existing.decision;

    if (!isNewRefund) {
      return this.prisma.dispute.update({
        where: { id },
        data: {
          ...updateDisputeDto,
          ...(resolvedAt ? { resolvedAt } : {}),
        },
      });
    }

    return this.prisma.$transaction(async (tx) => {
      const order = await tx.order.findUnique({ where: { id: existing.orderId } });
      if (!order) throw new NotFoundException(`Commande liée au litige introuvable`);

      const refundAmount = existing.ticketAmount ?? order.totalTickets;

      const vendor = await tx.vendor.findUnique({ where: { id: existing.vendorId } });
      if (!vendor) throw new NotFoundException(`Vendeur lié au litige introuvable`);

      const vendorBalance = Number(vendor.balanceFcfa);
      const debitFromVendor = Math.min(vendorBalance, refundAmount);
      const platformAdvance = refundAmount - debitFromVendor;

      await tx.vendor.update({
        where: { id: vendor.id },
        data: {
          balanceFcfa: { decrement: debitFromVendor },
          ...(platformAdvance > 0 ? { debtFcfa: { increment: platformAdvance } } : {}),
        },
      });

      if (platformAdvance > 0) {
        await tx.debt.create({
          data: {
            vendorId: vendor.id,
            amount: platformAdvance,
            remainingAmount: platformAdvance,
            reason: `Avance plateforme — remboursement litige ${existing.id} (solde vendeur insuffisant)`,
          },
        });
      }

      await tx.user.update({
        where: { id: existing.studentId },
        data: { walletBalance: { increment: refundAmount } },
      });

      await tx.transaction.create({
        data: {
          userId: existing.studentId,
          type: TransactionType.REFUND,
          status: TransactionStatus.COMPLETED,
          amount: refundAmount,
          reference: `DISPUTE-REFUND-${existing.id}`,
          description: `Remboursement suite au litige ${existing.id} (commande ${existing.orderId})`,
          relatedOrderId: existing.orderId,
        },
      });

      return tx.dispute.update({
        where: { id },
        data: {
          ...updateDisputeDto,
          resolvedAt: resolvedAt ?? existing.resolvedAt ?? new Date(),
        },
      });
    });
  }
}
