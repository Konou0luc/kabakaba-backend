import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../../database/services/prisma.service';
import { CreateAuditLogDto } from '../dto/create-audit-log.dto';
import { SuspensionsService } from '../../users/services/suspensions.service';

@Injectable()
export class AdminService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly suspensionsService: SuspensionsService,
  ) {}

  async createAuditLog(createAuditLogDto: CreateAuditLogDto) {
    return this.prisma.auditLog.create({
      data: createAuditLogDto,
    });
  }

  async findAllAuditLogs(page: number = 1, limit: number = 10, adminId?: string) {
    const skip = (page - 1) * limit;
    const where = {
      ...(adminId ? { adminId } : {}),
    };
    const [total, data] = await this.prisma.$transaction([
      this.prisma.auditLog.count({ where }),
      this.prisma.auditLog.findMany({
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

  async findOneAuditLog(id: string) {
    const auditLog = await this.prisma.auditLog.findUnique({
      where: { id },
    });

    if (!auditLog) throw new NotFoundException(`Journal d'audit avec l'identifiant ${id} introuvable`);

    return auditLog;
  }

  async getSupervisionStats() {
    const since30d = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

    const [
      totalUsers,
      totalVendors,
      totalOrders,
      totalPayments,
      totalTransactions,
      activeSuspensions,
      suspensions30d,
      totalBanned,
      activeStudentRows,
      activeVendorRows,
    ] = await Promise.all([
      this.prisma.user.count(),
      this.prisma.vendor.count(),
      this.prisma.order.count(),
      this.prisma.payment.count(),
      this.prisma.transaction.count(),
      this.prisma.user.count({ where: { isSuspended: true } }),
      this.suspensionsService.countLast30Days(),
      this.prisma.user.count({ where: { isBanned: true } }),
      // Étudiant actif = a passé au moins 1 commande dans les 30 derniers jours
      this.prisma.order.findMany({
        where: { createdAt: { gte: since30d } },
        select: { studentId: true },
        distinct: ['studentId'],
      }),
      // Cantine active = a reçu au moins 1 commande dans les 30 derniers jours
      this.prisma.order.findMany({
        where: { createdAt: { gte: since30d } },
        select: { vendorId: true },
        distinct: ['vendorId'],
      }),
    ]);

    return {
      totalUsers,
      totalVendors,
      totalOrders,
      totalPayments,
      totalTransactions,
      activeSuspensions,
      suspensions30d,
      totalBanned,
      activeStudents30d: activeStudentRows.length,
      activeVendors30d: activeVendorRows.length,
    };
  }

  // ─── Centre de notifications : événements système du jour ──────────
  // Se réinitialise chaque jour (fenêtre = depuis minuit, heure serveur).

  async getTodayEvents() {
    const startOfDay = new Date();
    startOfDay.setHours(0, 0, 0, 0);

    const [newStudents, newVendors, badReviews, suspensions, newAmbassadors, resolvedDisputes] = await Promise.all([
      this.prisma.user.findMany({
        where: { role: 'STUDENT', createdAt: { gte: startOfDay } },
        select: { id: true, firstName: true, lastName: true, createdAt: true },
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.vendor.findMany({
        where: { createdAt: { gte: startOfDay } },
        select: { id: true, canteenName: true, createdAt: true },
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.review.findMany({
        where: { rating: { lte: 2 }, createdAt: { gte: startOfDay }, deletedAt: null },
        select: { id: true, rating: true, createdAt: true, vendor: { select: { canteenName: true } } },
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.suspensionEvent.findMany({
        where: { suspendedAt: { gte: startOfDay } },
        select: {
          id: true,
          reason: true,
          suspendedAt: true,
          student: { select: { firstName: true, lastName: true } },
        },
        orderBy: { suspendedAt: 'desc' },
      }),
      this.prisma.ambassador.findMany({
        where: { status: 'ACTIVE', updatedAt: { gte: startOfDay } },
        select: { id: true, updatedAt: true, user: { select: { firstName: true, lastName: true } } },
        orderBy: { updatedAt: 'desc' },
      }),
      this.prisma.dispute.findMany({
        where: { status: 'RESOLVED', resolvedAt: { gte: startOfDay } },
        select: { id: true, resolvedAt: true, vendor: { select: { canteenName: true } } },
        orderBy: { resolvedAt: 'desc' },
      }),
    ]);

    const fullName = (p: { firstName?: string | null; lastName?: string | null }) =>
      [p.firstName, p.lastName].filter(Boolean).join(' ') || 'Un utilisateur';

    const events = [
      ...newStudents.map((u) => ({
        id: `student-${u.id}`,
        type: 'NEW_STUDENT' as const,
        message: `${fullName(u)} vient de s'inscrire`,
        occurredAt: u.createdAt,
      })),
      ...newVendors.map((v) => ({
        id: `vendor-${v.id}`,
        type: 'NEW_VENDOR' as const,
        message: `Nouvelle cantine ouverte : ${v.canteenName}`,
        occurredAt: v.createdAt,
      })),
      ...badReviews.map((r) => ({
        id: `review-${r.id}`,
        type: 'BAD_REVIEW' as const,
        message: `Note faible (${r.rating}/5) reçue par ${r.vendor.canteenName}`,
        occurredAt: r.createdAt,
      })),
      ...suspensions.map((s) => ({
        id: `suspension-${s.id}`,
        type: 'SUSPENSION' as const,
        message: `Compte suspendu : ${fullName(s.student)} (${s.reason})`,
        occurredAt: s.suspendedAt,
      })),
      ...newAmbassadors.map((a) => ({
        id: `ambassador-${a.id}`,
        type: 'NEW_AMBASSADOR' as const,
        message: `Nouvel ambassadeur validé : ${fullName(a.user)}`,
        occurredAt: a.updatedAt,
      })),
      ...resolvedDisputes.map((d) => ({
        id: `dispute-${d.id}`,
        type: 'DISPUTE_RESOLVED' as const,
        message: `Litige réglé pour ${d.vendor.canteenName}`,
        // resolvedAt est typé Date | null par Prisma, mais le filtre
        // { resolvedAt: { gte: startOfDay } } garantit qu'il est toujours défini ici.
        occurredAt: d.resolvedAt as Date,
      })),
    ].sort((a, b) => new Date(b.occurredAt).getTime() - new Date(a.occurredAt).getTime());

    return { events, count: events.length, since: startOfDay };
  }
}