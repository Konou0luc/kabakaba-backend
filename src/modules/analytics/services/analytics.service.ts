import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../database/services/prisma.service';

const COMPLETED_STATUSES = ['RECEIVED', 'AUTO_RECEIVED'];
const DECIDED_STATUSES = ['RECEIVED', 'AUTO_RECEIVED', 'REFUSED', 'CANCELLED_VENDOR'];

// Taux FedaPay par opérateur — voir doc métier 5.1 (surplus recharge étudiant).
const FEE_RATE_BY_OPERATOR: Record<string, number> = {
  FLOOZ: 0.025,
  MIXX: 0.035,
};

function daysAgo(n: number) {
  return new Date(Date.now() - n * 24 * 60 * 60 * 1000);
}

function dayKey(d: Date) {
  return d.toISOString().slice(0, 10);
}

// Règle métier 5.3 : paliers de frais de retrait non couverts.
function uncoveredWithdrawalFee(amount: number, platformFee: number, operatorFee: number) {
  if (amount < 10000) return platformFee + operatorFee;
  if (amount < 30000) return operatorFee;
  return 0;
}

@Injectable()
export class AnalyticsService {
  constructor(private readonly prisma: PrismaService) {}

  async getCampusComparison(days = 30) {
    // ... méthode existante inchangée, voir tour précédent ...
    const since = daysAgo(days);
    const prevSince = daysAgo(days * 2);
    const sevenDaysAgo = daysAgo(7);

    const [campuses, students, ordersWindow, ordersPrevWindow, orders7d, vendorCampusLinks] = await Promise.all([
      this.prisma.campus.findMany({ orderBy: { name: 'asc' } }),
      this.prisma.user.findMany({
        where: { role: 'STUDENT', campusId: { not: null } },
        select: { id: true, campusId: true },
      }),
      this.prisma.order.findMany({
        where: { createdAt: { gte: since } },
        select: { status: true, escrowAmount: true, studentId: true, student: { select: { campusId: true } } },
      }),
      this.prisma.order.findMany({
        where: { createdAt: { gte: prevSince, lt: since } },
        select: { status: true, escrowAmount: true },
      }),
      this.prisma.order.findMany({
        where: { createdAt: { gte: sevenDaysAgo } },
        select: { createdAt: true, student: { select: { campusId: true } } },
      }),
      this.prisma.vendorCampus.findMany({ select: { campusId: true } }),
    ]);

    const cantinesByCampus = new Map<string, number>();
    for (const link of vendorCampusLinks) {
      cantinesByCampus.set(link.campusId, (cantinesByCampus.get(link.campusId) ?? 0) + 1);
    }

    const enrolledByCampus = new Map<string, number>();
    for (const s of students) {
      if (s.campusId) enrolledByCampus.set(s.campusId, (enrolledByCampus.get(s.campusId) ?? 0) + 1);
    }

    const activeStudentIdsByCampus = new Map<string, Set<string>>();
    const statsByCampus = new Map<string, { orders: number; completed: number; revenue: number }>();

    for (const o of ordersWindow) {
      const campusId = o.student?.campusId;
      if (!campusId) continue;
      if (!activeStudentIdsByCampus.has(campusId)) activeStudentIdsByCampus.set(campusId, new Set());
      activeStudentIdsByCampus.get(campusId)!.add(o.studentId);
      const entry = statsByCampus.get(campusId) ?? { orders: 0, completed: 0, revenue: 0 };
      entry.orders += 1;
      if (COMPLETED_STATUSES.includes(o.status)) {
        entry.completed += 1;
        entry.revenue += Number(o.escrowAmount);
      }
      statsByCampus.set(campusId, entry);
    }

    let prevTotalOrders = 0;
    let prevTotalRevenue = 0;
    for (const o of ordersPrevWindow) {
      prevTotalOrders += 1;
      if (COMPLETED_STATUSES.includes(o.status)) prevTotalRevenue += Number(o.escrowAmount);
    }

    const dayKeys: string[] = [];
    for (let i = 6; i >= 0; i--) dayKeys.push(dayKey(daysAgo(i)));
    const dailyByCampus = new Map<string, number[]>();
    const dailyTotal = new Array(7).fill(0);
    for (const o of orders7d) {
      const idx = dayKeys.indexOf(dayKey(o.createdAt));
      if (idx === -1) continue;
      dailyTotal[idx] += 1;
      const campusId = o.student?.campusId;
      if (!campusId) continue;
      if (!dailyByCampus.has(campusId)) dailyByCampus.set(campusId, new Array(7).fill(0));
      dailyByCampus.get(campusId)![idx] += 1;
    }

    const campusRows = campuses.map((c) => {
      const stats = statsByCampus.get(c.id) ?? { orders: 0, completed: 0, revenue: 0 };
      return {
        id: c.id,
        name: c.name,
        cantines: cantinesByCampus.get(c.id) ?? 0,
        orders: stats.orders,
        completionRate: stats.orders > 0 ? Math.round((stats.completed / stats.orders) * 100) : 0,
        revenue: stats.revenue,
        enrolled: enrolledByCampus.get(c.id) ?? 0,
        active: activeStudentIdsByCampus.get(c.id)?.size ?? 0,
        isActive: c.isActive,
      };
    });

    return {
      summary: {
        activeCampuses: campuses.filter((c) => c.isActive).length,
        totalCampuses: campuses.length,
        totalOrders: campusRows.reduce((s, c) => s + c.orders, 0),
        totalOrdersPrevPeriod: prevTotalOrders,
        totalRevenue: campusRows.reduce((s, c) => s + c.revenue, 0),
        totalRevenuePrevPeriod: prevTotalRevenue,
        totalStudents: campusRows.reduce((s, c) => s + c.enrolled, 0),
        activeStudents: campusRows.reduce((s, c) => s + c.active, 0),
      },
      campuses: campusRows,
      dailyVolume: {
        labels: dayKeys,
        series: {
          'Tous les campus': dailyTotal,
          ...Object.fromEntries(campuses.map((c) => [c.name, dailyByCampus.get(c.id) ?? new Array(7).fill(0)])),
        },
      },
    };
  }

  async getTopCanteens(days = 30, limit = 10) {
    // ... méthode existante inchangée, voir tour précédent ...
    const since = daysAgo(days);
    const [orders, vendors, reviews, vendorCampusLinks, campuses] = await Promise.all([
      this.prisma.order.findMany({ where: { createdAt: { gte: since } }, select: { vendorId: true, status: true } }),
      this.prisma.vendor.findMany({ select: { id: true, canteenName: true } }),
      this.prisma.review.findMany({ select: { vendorId: true, rating: true } }),
      this.prisma.vendorCampus.findMany({ select: { vendorId: true, campusId: true } }),
      this.prisma.campus.findMany({ select: { id: true, name: true } }),
    ]);

    const campusNameById = new Map(campuses.map((c) => [c.id, c.name]));
    const campusNamesByVendor = new Map<string, string[]>();
    for (const link of vendorCampusLinks) {
      if (!campusNamesByVendor.has(link.vendorId)) campusNamesByVendor.set(link.vendorId, []);
      const name = campusNameById.get(link.campusId);
      if (name) campusNamesByVendor.get(link.vendorId)!.push(name);
    }

    const statsByVendor = new Map<string, { orders: number; decided: number; accepted: number }>();
    for (const o of orders) {
      const entry = statsByVendor.get(o.vendorId) ?? { orders: 0, decided: 0, accepted: 0 };
      entry.orders += 1;
      if (DECIDED_STATUSES.includes(o.status)) {
        entry.decided += 1;
        if (COMPLETED_STATUSES.includes(o.status)) entry.accepted += 1;
      }
      statsByVendor.set(o.vendorId, entry);
    }

    const ratingsByVendor = new Map<string, { sum: number; count: number }>();
    for (const r of reviews) {
      const entry = ratingsByVendor.get(r.vendorId) ?? { sum: 0, count: 0 };
      entry.sum += r.rating;
      entry.count += 1;
      ratingsByVendor.set(r.vendorId, entry);
    }

    return vendors
      .map((v) => {
        const stats = statsByVendor.get(v.id) ?? { orders: 0, decided: 0, accepted: 0 };
        const ratings = ratingsByVendor.get(v.id);
        return {
          id: v.id,
          name: v.canteenName,
          campusName: campusNamesByVendor.get(v.id)?.join(', ') ?? '—',
          orders: stats.orders,
          acceptanceRate: stats.decided > 0 ? Math.round((stats.accepted / stats.decided) * 100) : 0,
          avgRating: ratings && ratings.count > 0 ? Number((ratings.sum / ratings.count).toFixed(1)) : null,
        };
      })
      .filter((v) => v.orders > 0)
      .sort((a, b) => b.orders - a.orders)
      .slice(0, limit);
  }

  // ─── Nouveau : Volume & revenus ───────────────────────────────────
  async getRevenueBreakdown(days = 30) {
    const since = daysAgo(days);

    const [payments, withdrawals, commissions, campuses, vendorCampusLinks] = await Promise.all([
      this.prisma.payment.findMany({
        where: { status: 'SUCCESS', createdAt: { gte: since } },
        select: {
          operator: true,
          amountFcfa: true,
          ticketsReceived: true,
          createdAt: true,
          user: { select: { campusId: true } },
        },
      }),
      this.prisma.withdrawal.findMany({
        where: { status: 'COMPLETED', createdAt: { gte: since } },
        select: {
          vendorId: true,
          amount: true,
          platformFee: true,
          operatorFee: true,
          createdAt: true,
        },
      }),
      this.prisma.ambassadorCommission.findMany({
        where: { deletedAt: null, createdAt: { gte: since } },
        select: {
          amount: true,
          createdAt: true,
          payment: { select: { user: { select: { campusId: true } } } },
        },
      }),
      this.prisma.campus.findMany({ select: { id: true, name: true } }),
      this.prisma.vendorCampus.findMany({ select: { vendorId: true, campusId: true } }),
    ]);

    const campusNameById = new Map(campuses.map((c) => [c.id, c.name]));
    const campusIdsByVendor = new Map<string, string[]>();
    for (const link of vendorCampusLinks) {
      if (!campusIdsByVendor.has(link.vendorId)) campusIdsByVendor.set(link.vendorId, []);
      campusIdsByVendor.get(link.vendorId)!.push(link.campusId);
    }

    type CampusAgg = { surplus: number; uncoveredFees: number; commissions: number; rechargesGross: number };
    const byCampus = new Map<string, CampusAgg>();
    const ensure = (id: string) => {
      if (!byCampus.has(id)) byCampus.set(id, { surplus: 0, uncoveredFees: 0, commissions: 0, rechargesGross: 0 });
      return byCampus.get(id)!;
    };

    let totalSurplus = 0;
    let totalUncoveredFees = 0;
    let totalCommissions = 0;
    let totalGross = 0;

    for (const p of payments) {
      const rate = FEE_RATE_BY_OPERATOR[p.operator] ?? 0;
      const realCost = p.ticketsReceived / (1 - rate);
      const surplus = Number(p.amountFcfa) - realCost;
      totalSurplus += surplus;
      totalGross += Number(p.amountFcfa);
      const campusId = p.user?.campusId;
      if (campusId) {
        const agg = ensure(campusId);
        agg.surplus += surplus;
        agg.rechargesGross += Number(p.amountFcfa);
      }
    }

    for (const w of withdrawals) {
      const fee = uncoveredWithdrawalFee(Number(w.amount), Number(w.platformFee), Number(w.operatorFee));
      totalUncoveredFees += fee;
      const campusIds = campusIdsByVendor.get(w.vendorId) ?? [];
      for (const campusId of campusIds) {
        ensure(campusId).uncoveredFees += fee;
      }
    }

    for (const c of commissions) {
      totalCommissions += Number(c.amount);
      const campusId = c.payment?.user?.campusId;
      if (campusId) ensure(campusId).commissions += Number(c.amount);
    }

    const perCampus = campuses.map((c) => {
      const agg = byCampus.get(c.id) ?? { surplus: 0, uncoveredFees: 0, commissions: 0, rechargesGross: 0 };
      return {
        id: c.id,
        name: c.name,
        rechargesGross: agg.rechargesGross,
        surplus: agg.surplus,
        commissions: agg.commissions,
        net: agg.surplus + agg.uncoveredFees - agg.commissions,
      };
    });

    // Évolution 7 jours du revenu net (mêmes 3 composantes, par jour)
    const dayKeys: string[] = [];
    for (let i = 6; i >= 0; i--) dayKeys.push(dayKey(daysAgo(i)));
    const dailyNet = new Array(7).fill(0);

    for (const p of payments) {
      const idx = dayKeys.indexOf(dayKey(p.createdAt));
      if (idx === -1) continue;
      const rate = FEE_RATE_BY_OPERATOR[p.operator] ?? 0;
      dailyNet[idx] += Number(p.amountFcfa) - p.ticketsReceived / (1 - rate);
    }
    for (const w of withdrawals) {
      const idx = dayKeys.indexOf(dayKey(w.createdAt));
      if (idx === -1) continue;
      dailyNet[idx] += uncoveredWithdrawalFee(Number(w.amount), Number(w.platformFee), Number(w.operatorFee));
    }
    for (const c of commissions) {
      const idx = dayKeys.indexOf(dayKey(c.createdAt));
      if (idx === -1) continue;
      dailyNet[idx] -= Number(c.amount);
    }

    return {
      summary: {
        surplus: totalSurplus,
        uncoveredFees: totalUncoveredFees,
        commissions: totalCommissions,
        net: totalSurplus + totalUncoveredFees - totalCommissions,
        rechargesGross: totalGross,
      },
      perCampus,
      dailyNet: { labels: dayKeys, values: dailyNet },
    };
  }
}