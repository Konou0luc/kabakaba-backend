import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
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

    // SÉCURITÉ : ticketAmount est fourni par le client — il ne doit jamais
    // pouvoir dépasser le montant réel de la commande contestée, sous peine
    // de permettre un remboursement supérieur au préjudice réel si le litige
    // est accepté par un administrateur.
    if (
      createDisputeDto.ticketAmount !== undefined &&
      createDisputeDto.ticketAmount > order.totalTickets
    ) {
      throw new BadRequestException(
        `Le montant contesté ne peut pas dépasser le total de la commande (${order.totalTickets} tickets)`,
      );
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
    campusId?: string,
    days?: number,
  ) {
    const skip = (page - 1) * limit;
    const since = days ? new Date(Date.now() - days * 24 * 60 * 60 * 1000) : undefined;
    const where = {
      ...(status ? { status } : {}),
      ...(vendorId ? { vendorId } : {}),
      ...(studentId ? { studentId } : {}),
      ...(orderId ? { orderId } : {}),
      ...(campusId ? { student: { campusId } } : {}),
      ...(since ? { createdAt: { gte: since } } : {}),
    };

    const [total, data] = await this.prisma.$transaction([
      this.prisma.dispute.count({ where }),
      this.prisma.dispute.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: {
          student: { select: { id: true, firstName: true, lastName: true, campus: { select: { id: true, name: true } } } },
          vendor: { select: { id: true, canteenName: true } },
          order: { select: { id: true } },
        },
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

  // KPIs de la page Litiges (dashboard admin web).
  async getStats() {
    const startOfMonth = new Date();
    startOfMonth.setDate(1);
    startOfMonth.setHours(0, 0, 0, 0);

    const [openCount, inProgressCount, resolvedThisMonth] = await Promise.all([
      this.prisma.dispute.count({ where: { status: 'OPEN' } }),
      this.prisma.dispute.count({ where: { status: 'IN_PROGRESS' } }),
      this.prisma.dispute.findMany({
        where: { status: 'RESOLVED', resolvedAt: { gte: startOfMonth } },
        select: { decision: true, createdAt: true, resolvedAt: true },
      }),
    ]);

    const refundedCount = resolvedThisMonth.filter((d) => d.decision === 'REFUND').length;
    const resolutionDelaysMs = resolvedThisMonth
      .filter((d) => d.resolvedAt !== null)
      .map((d) => d.resolvedAt!.getTime() - d.createdAt.getTime());
    const avgResolutionMs = resolutionDelaysMs.length > 0
      ? resolutionDelaysMs.reduce((s, ms) => s + ms, 0) / resolutionDelaysMs.length
      : null;

    return {
      open: openCount,
      inProgress: inProgressCount,
      resolvedThisMonth: resolvedThisMonth.length,
      refundedThisMonth: refundedCount,
      avgResolutionMinutes: avgResolutionMs != null ? Math.round(avgResolutionMs / 60000) : null,
    };
  }

  /**
   * Détail enrichi pour LitigeDetail.jsx : parties, timeline de la commande,
   * et signaux de confiance calculés à partir de l'historique réel — pas de
   * texte généré ("analyse automatique" façon IA), seulement des faits
   * comptés en base. La maquette imaginait aussi une "version du vendeur"
   * en texte libre : aucun champ de ce type n'existe sur Dispute (seul
   * `reason`, rempli par l'auteur du litige, existe), donc ce n'est pas
   * reconstruit ici.
   */
  async findContext(id: string) {
    const dispute = await this.prisma.dispute.findUnique({
      where: { id },
      include: {
        student: {
          select: {
            id: true, firstName: true, lastName: true, phone: true, walletBalance: true, createdAt: true,
            isSuspended: true, suspensionReason: true, suspensionUntil: true,
            campus: { select: { name: true } },
          },
        },
        vendor: {
          select: {
            id: true, canteenName: true, balanceFcfa: true, isActive: true,
            user: { select: { firstName: true, lastName: true } },
            campuses: { select: { campus: { select: { name: true } } } },
          },
        },
        order: {
          include: {
            statusHistory: { orderBy: { createdAt: 'asc' } },
            review: true,
            packagingOption: { select: { name: true } },
          },
        },
      },
    });
    if (!dispute) throw new NotFoundException(`Litige avec l'identifiant ${id} introuvable`);

    const sixMonthsAgo = new Date(Date.now() - 180 * 24 * 60 * 60 * 1000);
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const startOfMonth = new Date();
    startOfMonth.setDate(1);
    startOfMonth.setHours(0, 0, 0, 0);

    const [
      disputesThisMonth,
      totalStudentOrders,
      disputedOrderIdsRows,
      suspensionCount,
      ordersWithThisVendor,
      vendorTotalOrders,
      vendorRefusedOrders,
      similarVendorDisputes,
      vendorReadyOrders,
      vendorReviewsAgg,
    ] = await Promise.all([
      this.prisma.dispute.count({
        where: { studentId: dispute.studentId, createdAt: { gte: startOfMonth }, id: { not: id } },
      }),
      this.prisma.order.count({ where: { studentId: dispute.studentId, deletedAt: null } }),
      this.prisma.dispute.findMany({ where: { studentId: dispute.studentId }, select: { orderId: true } }),
      this.prisma.suspensionEvent.count({ where: { studentId: dispute.studentId } }),
      this.prisma.order.count({ where: { studentId: dispute.studentId, vendorId: dispute.vendorId, deletedAt: null } }),
      this.prisma.order.count({ where: { vendorId: dispute.vendorId, deletedAt: null } }),
      this.prisma.order.count({
        where: { vendorId: dispute.vendorId, deletedAt: null, status: { in: ['REFUSED', 'CANCELLED_VENDOR'] } },
      }),
      this.prisma.dispute.count({
        where: { vendorId: dispute.vendorId, createdAt: { gte: sixMonthsAgo }, id: { not: id } },
      }),
      this.prisma.order.findMany({
        where: { vendorId: dispute.vendorId, deletedAt: null, readyAt: { not: null }, createdAt: { gte: thirtyDaysAgo } },
        select: { createdAt: true, readyAt: true },
      }),
      this.prisma.review.aggregate({
        where: { vendorId: dispute.vendorId, deletedAt: null, createdAt: { gte: thirtyDaysAgo } },
        _avg: { rating: true },
        _count: true,
      }),
    ]);

    const distinctDisputedOrders = new Set(disputedOrderIdsRows.map((r) => r.orderId)).size;
    const incidentFreeOrders = Math.max(0, totalStudentOrders - distinctDisputedOrders);

    const acceptanceRate = vendorTotalOrders > 0
      ? Math.round(((vendorTotalOrders - vendorRefusedOrders) / vendorTotalOrders) * 100)
      : null;

    const prepDelaysMin = vendorReadyOrders.map((o) => (o.readyAt!.getTime() - o.createdAt.getTime()) / 60000);
    const avgPrepMinutes = prepDelaysMin.length > 0
      ? Math.round(prepDelaysMin.reduce((s, m) => s + m, 0) / prepDelaysMin.length)
      : null;

    return {
      dispute: {
        id: dispute.id,
        reason: dispute.reason,
        ticketAmount: dispute.ticketAmount,
        status: dispute.status,
        decision: dispute.decision,
        decisionNote: dispute.decisionNote,
        createdAt: dispute.createdAt,
        resolvedAt: dispute.resolvedAt,
      },
      student: {
        id: dispute.student.id,
        name: `${dispute.student.firstName ?? ''} ${dispute.student.lastName ?? ''}`.trim(),
        phone: dispute.student.phone,
        campusName: dispute.student.campus?.name ?? null,
        walletBalance: Number(dispute.student.walletBalance),
        memberSince: dispute.student.createdAt,
        isSuspended: dispute.student.isSuspended,
        suspensionReason: dispute.student.suspensionReason,
        suspensionUntil: dispute.student.suspensionUntil,
      },
      vendor: {
        id: dispute.vendor.id,
        canteenName: dispute.vendor.canteenName,
        ownerName: `${dispute.vendor.user?.firstName ?? ''} ${dispute.vendor.user?.lastName ?? ''}`.trim(),
        campusName: dispute.vendor.campuses[0]?.campus.name ?? null,
        balanceFcfa: Number(dispute.vendor.balanceFcfa),
        isActive: dispute.vendor.isActive,
      },
      order: {
        id: dispute.order.id,
        status: dispute.order.status,
        totalTickets: dispute.order.totalTickets,
        packagingOptionName: dispute.order.packagingOption?.name ?? null,
        createdAt: dispute.order.createdAt,
        readyAt: dispute.order.readyAt,
        confirmedAt: dispute.order.confirmedAt,
        statusHistory: dispute.order.statusHistory,
        review: dispute.order.review
          ? { rating: dispute.order.review.rating, comment: dispute.order.review.comment }
          : null,
      },
      signals: {
        student: {
          disputesThisMonth,
          incidentFreeOrders,
          neverSuspended: suspensionCount === 0,
          suspensionCount,
          ordersWithThisVendor,
          thisOrderAutoReceived: dispute.order.status === 'AUTO_RECEIVED',
        },
        vendor: {
          acceptanceRate,
          similarDisputesLast6Months: similarVendorDisputes,
          avgPrepMinutes,
          avgRating30d: vendorReviewsAgg._avg.rating != null ? Number(vendorReviewsAgg._avg.rating.toFixed(1)) : null,
          reviewCount30d: vendorReviewsAgg._count,
        },
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
