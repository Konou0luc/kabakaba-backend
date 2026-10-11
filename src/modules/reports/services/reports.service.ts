import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { OrderStatus, ReportStatus, ReportType, UserRole } from '@prisma/client';
import { PrismaService } from '../../../database/services/prisma.service';
import { CreateReportDto } from '../dto/create-report.dto';
import { UpdateReportDto } from '../dto/update-report.dto';

const REPORT_WEB_INCLUDE = {
  student: { select: { id: true, firstName: true, lastName: true, phone: true } },
  vendor: { select: { id: true, canteenName: true } },
  order: { select: { id: true, orderNumber: true, status: true, totalTickets: true, consumptionMode: true } },
} as const;

@Injectable()
export class ReportsService {
  constructor(private readonly prisma: PrismaService) {}

  // Un signalement n'a aucun effet financier ni sur la commande : il ne
  // rembourse rien et ne change aucun statut (cahier, section 35).
  async create(createReportDto: CreateReportDto, studentId: string) {
    const order = await this.prisma.order.findUnique({
      where: { id: createReportDto.orderId, deletedAt: null },
    });
    if (!order) {
      throw new NotFoundException(`Commande avec l'identifiant ${createReportDto.orderId} introuvable`);
    }

    if (order.studentId !== studentId) {
      throw new ForbiddenException('Vous ne pouvez signaler que vos propres commandes');
    }

    // Seules READY et RECEIVED sont acceptées, et une commande ne revient jamais
    // en arrière : le statut lu ici ne peut pas sortir de cet ensemble avant l'écriture.
    if (order.status !== OrderStatus.READY && order.status !== OrderStatus.RECEIVED) {
      throw new BadRequestException(
        'Un problème ne peut être signalé que sur une commande prête ou récupérée',
      );
    }

    return this.prisma.$transaction(async (tx) => {
      // Verrou de ligne sur la commande : deux signalements simultanés se suivent,
      // le second voit donc le premier et aucun doublon ne peut naître.
      await tx.$queryRaw`SELECT id FROM "Order" WHERE id = ${order.id} FOR UPDATE`;

      const unresolved = await tx.report.findFirst({
        where: { orderId: order.id, status: { not: ReportStatus.RESOLVED } },
        select: { id: true },
      });
      if (unresolved) {
        throw new ConflictException('Un signalement est déjà en cours de traitement pour cette commande');
      }

      return tx.report.create({
        data: {
          orderId: order.id,
          studentId: order.studentId,
          vendorId: order.vendorId,
          type: createReportDto.type,
          comment: createReportDto.comment,
        },
      });
    });
  }

  async findAll(
    page: number = 1,
    limit: number = 10,
    status?: ReportStatus,
    type?: ReportType,
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
      ...(type ? { type } : {}),
      ...(vendorId ? { vendorId } : {}),
      ...(studentId ? { studentId } : {}),
      ...(orderId ? { orderId } : {}),
      ...(campusId ? { student: { campusId } } : {}),
      ...(createdAt ? { createdAt } : {}),
    };

    const [total, data] = await this.prisma.$transaction([
      this.prisma.report.count({ where }),
      this.prisma.report.findMany({
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

  // KPIs de la page Signalements (dashboard admin web).
  async getStats() {
    const startOfMonth = new Date();
    startOfMonth.setDate(1);
    startOfMonth.setHours(0, 0, 0, 0);

    const [openCount, inProgressCount, resolvedThisMonth] = await Promise.all([
      this.prisma.report.count({ where: { status: ReportStatus.OPEN } }),
      this.prisma.report.count({ where: { status: ReportStatus.IN_PROGRESS } }),
      this.prisma.report.findMany({
        where: { status: ReportStatus.RESOLVED, resolvedAt: { gte: startOfMonth } },
        select: { createdAt: true, resolvedAt: true },
      }),
    ]);

    const resolutionDelaysMs = resolvedThisMonth
      .filter((r) => r.resolvedAt !== null)
      .map((r) => r.resolvedAt!.getTime() - r.createdAt.getTime());
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

  async findOne(id: string, actor: { id: string; kind: 'mobile' | 'web'; role?: UserRole }) {
    // Relations simples pour la fiche admin web ; les clients mobiles reçoivent le signalement seul.
    const report = await this.prisma.report.findUnique({
      where: { id },
      include: actor.kind === 'web' ? REPORT_WEB_INCLUDE : undefined,
    });
    if (!report) throw new NotFoundException(`Signalement avec l'identifiant ${id} introuvable`);

    // L'accès web (admin, supervision) est contrôlé par les rôles de la route ;
    // côté mobile, seul l'étudiant propriétaire peut le consulter.
    if (actor.kind === 'web') return report;
    if (actor.role === UserRole.STUDENT && report.studentId === actor.id) return report;

    throw new ForbiddenException('Accès refusé à ce signalement');
  }

  async update(id: string, updateReportDto: UpdateReportDto) {
    const existing = await this.prisma.report.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException(`Signalement avec l'identifiant ${id} introuvable`);

    const resolvedAt =
      updateReportDto.status === ReportStatus.RESOLVED && !existing.resolvedAt ? new Date() : undefined;

    return this.prisma.report.update({
      where: { id },
      data: {
        ...updateReportDto,
        ...(resolvedAt ? { resolvedAt } : {}),
      },
    });
  }
}
