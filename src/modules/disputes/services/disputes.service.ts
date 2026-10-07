import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { DisputeStatus, UserRole, WebUserRole } from '@prisma/client';
import { PrismaService } from '../../../database/services/prisma.service';
import { CreateDisputeDto } from '../dto/create-dispute.dto';
import { UpdateDisputeDto } from '../dto/update-dispute.dto';

const DISPUTE_WEB_INCLUDE = {
  student: { select: { id: true, firstName: true, lastName: true, phone: true } },
  vendor: { select: { id: true, canteenName: true } },
  order: { select: { id: true, status: true, totalTickets: true, consumptionMode: true } },
} as const;

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

    // ticketAmount est fourni par le client : il ne doit jamais dépasser le
    // montant réel de la commande signalée.
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
    from?: string,
    to?: string,
  ) {
    const skip = (page - 1) * limit;
    // from/to (plage personnalisée du calendrier) prennent le pas sur `days`
    // (fenêtre glissante), comme resolveRange() dans analytics.service.ts.
    let createdAt: { gte?: Date; lte?: Date } | undefined;
    if (from || to) {
      const until = to ? new Date(to) : new Date();
      until.setHours(23, 59, 59, 999);
      createdAt = { ...(from ? { gte: new Date(from) } : {}), lte: until };
    } else if (days) {
      createdAt = { gte: new Date(Date.now() - days * 24 * 60 * 60 * 1000) };
    }
    const where = {
      ...(status ? { status } : {}),
      ...(vendorId ? { vendorId } : {}),
      ...(studentId ? { studentId } : {}),
      ...(orderId ? { orderId } : {}),
      ...(campusId ? { student: { campusId } } : {}),
      ...(createdAt ? { createdAt } : {}),
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
        select: { createdAt: true, resolvedAt: true },
      }),
    ]);

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
      avgResolutionMinutes: avgResolutionMs != null ? Math.round(avgResolutionMs / 60000) : null,
    };
  }

  async findVendorIdByUserId(userId: string): Promise<string | null> {
    const vendor = await this.prisma.vendor.findUnique({ where: { userId } });
    return vendor?.id ?? null;
  }

  async findOne(
    id: string,
    actor?: { id: string; kind: 'mobile' | 'web'; role?: UserRole | WebUserRole },
  ) {
    // Relations simples pour la fiche admin web ; les clients mobiles reçoivent le litige seul.
    const dispute = await this.prisma.dispute.findUnique({
      where: { id },
      include: actor?.kind === 'web' ? DISPUTE_WEB_INCLUDE : undefined,
    });
    if (!dispute) throw new NotFoundException(`Litige avec l'identifiant ${id} introuvable`);

    if (!actor) throw new ForbiddenException('Accès refusé à ce litige');

    if (actor.kind === 'web') {
      if (actor.role !== WebUserRole.ADMIN && actor.role !== WebUserRole.SUPERVISION) {
        throw new ForbiddenException('Accès refusé à ce litige');
      }
      return dispute;
    }

    if (actor.role === UserRole.STUDENT && dispute.studentId !== actor.id) {
      throw new ForbiddenException('Accès refusé à ce litige');
    }

    if (actor.role === UserRole.VENDOR) {
      const vendor = await this.prisma.vendor.findUnique({ where: { userId: actor.id } });
      if (!vendor || vendor.id !== dispute.vendorId) {
        throw new ForbiddenException('Accès refusé à ce litige');
      }
    }

    if (actor.role !== UserRole.STUDENT && actor.role !== UserRole.VENDOR) {
      throw new ForbiddenException('Accès refusé à ce litige');
    }

    return dispute;
  }

  async update(id: string, updateDisputeDto: UpdateDisputeDto) {
    const existing = await this.prisma.dispute.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException(`Litige avec l'identifiant ${id} introuvable`);

    const resolvedAt =
      updateDisputeDto.status === DisputeStatus.RESOLVED && !existing.resolvedAt ? new Date() : undefined;

    return this.prisma.dispute.update({
      where: { id },
      data: {
        ...updateDisputeDto,
        ...(resolvedAt ? { resolvedAt } : {}),
      },
    });
  }
}
