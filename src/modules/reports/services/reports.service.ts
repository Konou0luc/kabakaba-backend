import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { OrderStatus, ReportStatus, ReportType, UserRole, WebUserRole } from '@prisma/client';
import { PrismaService } from '../../../database/services/prisma.service';
import { CreateReportDto } from '../dto/create-report.dto';
import { UpdateReportDto } from '../dto/update-report.dto';
import { FindReportsQueryDto } from '../dto/find-reports-query.dto';

// Relations pour la fiche admin web ; l'étudiant reçoit son signalement seul. La commande porte ses
// lignes, pour juger un « composant manquant » ou une « commande incomplète » (CDC 35) : seulement
// ce que l'administration voit déjà sur une commande (nom, quantité, prix unitaire, menu ou composant).
const REPORT_WEB_INCLUDE = {
  student: { select: { id: true, firstName: true, lastName: true, phone: true } },
  vendor: { select: { id: true, canteenName: true } },
  order: {
    select: {
      id: true,
      orderNumber: true,
      status: true,
      totalTickets: true,
      consumptionMode: true,
      items: {
        select: { id: true, menuId: true, name: true, quantity: true, unitPrice: true },
        orderBy: { createdAt: 'asc' as const },
      },
    },
  },
} as const;

// Une commande ne peut être signalée qu'une fois prête ou récupérée (cahier V1.3, section 35).
const REPORTABLE_ORDER_STATUSES: OrderStatus[] = [OrderStatus.READY, OrderStatus.RECEIVED];

@Injectable()
export class ReportsService {
  constructor(private readonly prisma: PrismaService) {}

  // Signalement d'un problème par l'étudiant, sur SA commande READY ou RECEIVED.
  // Sans effet financier ni sur la commande : un signalement ne rembourse rien et
  // ne change aucun statut.
  async create(createReportDto: CreateReportDto, studentId: string) {
    const comment = createReportDto.comment?.trim() || null;
    if (createReportDto.type === ReportType.OTHER && !comment) {
      throw new BadRequestException('Un commentaire est obligatoire pour signaler un autre problème');
    }

    return this.prisma.$transaction(async (tx) => {
      // Verrou de ligne sur la commande : deux signalements simultanés sur la même
      // commande sont sérialisés, le second voit donc le premier (règle « un seul
      // signalement non traité par commande »).
      await tx.$queryRaw`SELECT id FROM "Order" WHERE id = ${createReportDto.orderId} FOR UPDATE`;

      const order = await tx.order.findUnique({ where: { id: createReportDto.orderId, deletedAt: null } });
      if (!order) {
        throw new NotFoundException(`Commande avec l'identifiant ${createReportDto.orderId} introuvable`);
      }
      if (order.studentId !== studentId) {
        throw new ForbiddenException('Vous ne pouvez signaler un problème que sur vos propres commandes');
      }
      if (!REPORTABLE_ORDER_STATUSES.includes(order.status)) {
        throw new BadRequestException('Vous ne pouvez signaler un problème que sur une commande prête ou récupérée');
      }

      const pending = await tx.report.findFirst({
        where: { orderId: order.id, status: { not: ReportStatus.RESOLVED } },
        select: { id: true },
      });
      if (pending) {
        throw new ConflictException('Un signalement est déjà en cours de traitement pour cette commande');
      }

      return tx.report.create({
        data: {
          orderId: order.id,
          studentId: order.studentId,
          vendorId: order.vendorId,
          type: createReportDto.type,
          comment,
        },
      });
    });
  }

  // studentId : imposé par le contrôleur pour un étudiant (il ne voit que les siens),
  // filtre facultatif pour l'administration web.
  async findAll(query: FindReportsQueryDto, studentId?: string) {
    const page = query.page ?? 1;
    const limit = query.limit ?? 10;
    const skip = (page - 1) * limit;
    // from/to (plage personnalisée du calendrier) prennent le pas sur `days`
    // (fenêtre glissante), comme resolveRange() dans analytics.service.ts.
    let createdAt: { gte?: Date; lte?: Date } | undefined;
    if (query.from || query.to) {
      const until = query.to ? new Date(query.to) : new Date();
      until.setHours(23, 59, 59, 999);
      createdAt = { ...(query.from ? { gte: new Date(query.from) } : {}), lte: until };
    } else if (query.days) {
      createdAt = { gte: new Date(Date.now() - query.days * 24 * 60 * 60 * 1000) };
    }
    const where = {
      ...(query.status ? { status: query.status } : {}),
      ...(query.type ? { type: query.type } : {}),
      ...(query.vendorId ? { vendorId: query.vendorId } : {}),
      ...(studentId ? { studentId } : {}),
      ...(query.orderId ? { orderId: query.orderId } : {}),
      ...(query.campusId ? { student: { campusId: query.campusId } } : {}),
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
          order: { select: { id: true, orderNumber: true } },
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
      this.prisma.report.count({ where: { status: 'OPEN' } }),
      this.prisma.report.count({ where: { status: 'IN_PROGRESS' } }),
      this.prisma.report.findMany({
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

  async findOne(
    id: string,
    actor?: { id: string; kind: 'mobile' | 'web'; role?: UserRole | WebUserRole },
  ) {
    const report = await this.prisma.report.findUnique({
      where: { id },
      include: actor?.kind === 'web' ? REPORT_WEB_INCLUDE : undefined,
    });
    if (!report) throw new NotFoundException(`Signalement avec l'identifiant ${id} introuvable`);

    if (!actor) throw new ForbiddenException('Accès refusé à ce signalement');

    if (actor.kind === 'web') {
      if (actor.role !== WebUserRole.ADMIN && actor.role !== WebUserRole.SUPERVISION) {
        throw new ForbiddenException('Accès refusé à ce signalement');
      }
      // Une ligne porte soit un menu (menuId), soit un composant libre : on expose ce fait sous
      // la forme `kind`, sans les identifiants internes.
      const { order } = report as typeof report & { order: { items: { id: string; menuId: string | null; name: string; quantity: number; unitPrice: number }[] } };
      return {
        ...report,
        order: {
          ...order,
          items: order.items.map(({ id: itemId, menuId, name, quantity, unitPrice }) => ({
            id: itemId,
            name,
            quantity,
            unitPrice,
            kind: menuId ? ('MENU' as const) : ('COMPONENT' as const),
          })),
        },
      };
    }

    // Côté mobile, seul l'étudiant auteur du signalement y accède.
    if (actor.role !== UserRole.STUDENT || report.studentId !== actor.id) {
      throw new ForbiddenException('Accès refusé à ce signalement');
    }

    return report;
  }

  // treatedByWebUserId : administrateur web connecté, lu dans le jeton par le contrôleur (jamais dans
  // le corps). Il est enregistré à chaque passage à IN_PROGRESS ou RESOLVED : le dernier administrateur
  // qui change le statut remplace le précédent. resolvedAt est posé au premier passage à RESOLVED.
  async update(id: string, updateReportDto: UpdateReportDto, treatedByWebUserId?: string) {
    const existing = await this.prisma.report.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException(`Signalement avec l'identifiant ${id} introuvable`);

    const { status } = updateReportDto;
    const resolvedAt = status === ReportStatus.RESOLVED && !existing.resolvedAt ? new Date() : undefined;
    const isTreatment = status === ReportStatus.IN_PROGRESS || status === ReportStatus.RESOLVED;

    return this.prisma.report.update({
      where: { id },
      data: {
        ...(status ? { status } : {}),
        ...(isTreatment && treatedByWebUserId ? { treatedByWebUserId } : {}),
        ...(resolvedAt ? { resolvedAt } : {}),
      },
    });
  }
}
