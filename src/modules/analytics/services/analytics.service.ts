import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../database/services/prisma.service';

const COMPLETED_STATUSES = ['RECEIVED', 'AUTO_RECEIVED'];
const DECIDED_STATUSES = ['RECEIVED', 'AUTO_RECEIVED', 'REFUSED', 'CANCELLED_VENDOR'];
const ACCEPTED_LINEAGE_STATUSES = ['ACCEPTED', 'IN_PREPARATION', 'READY', 'RECEIVED', 'AUTO_RECEIVED', 'REFUNDED'];
const DECISION_STATUSES = ['ACCEPTED', 'IN_PREPARATION', 'READY', 'RECEIVED', 'AUTO_RECEIVED', 'REFUNDED', 'REFUSED', 'CANCELLED_VENDOR'];

const FEE_RATE_BY_OPERATOR: Record<string, number> = { FLOOZ: 0.025, MIXX: 0.035 };

const ALERT_THRESHOLD_SECONDS = 5 * 60;
const WATCH_THRESHOLD_SECONDS = 3 * 60;

const RATING_ALERT_THRESHOLD = 3.5;

export const RATING_LABELS: Record<number, string> = {
  1: 'Pas du tout satisfait',
  2: 'Peut mieux faire',
  3: "Ce n'est pas mal",
  4: 'Satisfait',
  5: 'Excellent',
};

function daysAgo(n: number) {
  return new Date(Date.now() - n * 24 * 60 * 60 * 1000);
}

function dayKey(d: Date) {
  return d.toISOString().slice(0, 10);
}

function uncoveredWithdrawalFee(amount: number, platformFee: number, operatorFee: number) {
  if (amount < 10000) return platformFee + operatorFee;
  if (amount < 30000) return operatorFee;
  return 0;
}

@Injectable()
export class AnalyticsService {
  constructor(private readonly prisma: PrismaService) {}

  async getCampusComparison(days = 30) {
    const since = daysAgo(days);
    const prevSince = daysAgo(days * 2);
    const sevenDaysAgo = daysAgo(7);

    const [campuses, students, ordersWindow, ordersPrevWindow, orders7d, vendorCampusLinks] = await Promise.all([
      this.prisma.campus.findMany({ orderBy: { name: 'asc' } }),
      this.prisma.user.findMany({ where: { role: 'STUDENT', campusId: { not: null } }, select: { id: true, campusId: true } }),
      this.prisma.order.findMany({
        where: { createdAt: { gte: since } },
        select: { status: true, escrowAmount: true, studentId: true, student: { select: { campusId: true } } },
      }),
      this.prisma.order.findMany({ where: { createdAt: { gte: prevSince, lt: since } }, select: { status: true, escrowAmount: true } }),
      this.prisma.order.findMany({ where: { createdAt: { gte: sevenDaysAgo } }, select: { createdAt: true, student: { select: { campusId: true } } } }),
      this.prisma.vendorCampus.findMany({ select: { campusId: true } }),
    ]);

    const cantinesByCampus = new Map<string, number>();
    for (const link of vendorCampusLinks) cantinesByCampus.set(link.campusId, (cantinesByCampus.get(link.campusId) ?? 0) + 1);

    const enrolledByCampus = new Map<string, number>();
    for (const s of students) if (s.campusId) enrolledByCampus.set(s.campusId, (enrolledByCampus.get(s.campusId) ?? 0) + 1);

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
        series: { 'Tous les campus': dailyTotal, ...Object.fromEntries(campuses.map((c) => [c.name, dailyByCampus.get(c.id) ?? new Array(7).fill(0)])) },
      },
    };
  }

  async getTopCanteens(days = 30, limit = 10) {
    const since = daysAgo(days);
    const [orders, vendors, reviews, vendorCampusLinks, campuses] = await Promise.all([
      this.prisma.order.findMany({ where: { createdAt: { gte: since } }, select: { vendorId: true, status: true } }),
      this.prisma.vendor.findMany({ select: { id: true, canteenName: true } }),
      this.prisma.review.findMany({ where: { deletedAt: null }, select: { vendorId: true, rating: true } }),
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

  async getRevenueBreakdown(days = 30) {
    const since = daysAgo(days);
    const [payments, withdrawals, commissions, campuses, vendorCampusLinks] = await Promise.all([
      this.prisma.payment.findMany({
        where: { status: 'SUCCESS', createdAt: { gte: since } },
        select: { operator: true, amountFcfa: true, ticketsReceived: true, createdAt: true, user: { select: { campusId: true } } },
      }),
      this.prisma.withdrawal.findMany({
        where: { status: 'COMPLETED', createdAt: { gte: since } },
        select: { vendorId: true, amount: true, platformFee: true, operatorFee: true, createdAt: true },
      }),
      this.prisma.ambassadorCommission.findMany({
        where: { deletedAt: null, createdAt: { gte: since } },
        select: { amount: true, createdAt: true, payment: { select: { user: { select: { campusId: true } } } } },
      }),
      this.prisma.campus.findMany({ select: { id: true, name: true } }),
      this.prisma.vendorCampus.findMany({ select: { vendorId: true, campusId: true } }),
    ]);

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

    let totalSurplus = 0, totalUncoveredFees = 0, totalCommissions = 0, totalGross = 0;

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
      for (const campusId of campusIdsByVendor.get(w.vendorId) ?? []) ensure(campusId).uncoveredFees += fee;
    }

    for (const c of commissions) {
      totalCommissions += Number(c.amount);
      const campusId = c.payment?.user?.campusId;
      if (campusId) ensure(campusId).commissions += Number(c.amount);
    }

    const perCampus = campuses.map((c) => {
      const agg = byCampus.get(c.id) ?? { surplus: 0, uncoveredFees: 0, commissions: 0, rechargesGross: 0 };
      return { id: c.id, name: c.name, rechargesGross: agg.rechargesGross, surplus: agg.surplus, commissions: agg.commissions, net: agg.surplus + agg.uncoveredFees - agg.commissions };
    });

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
      summary: { surplus: totalSurplus, uncoveredFees: totalUncoveredFees, commissions: totalCommissions, net: totalSurplus + totalUncoveredFees - totalCommissions, rechargesGross: totalGross },
      perCampus,
      dailyNet: { labels: dayKeys, values: dailyNet },
    };
  }

  async getVendorPerformance(days = 30) {
    const since = daysAgo(days);
    const [orders, acceptanceEvents, vendors, vendorCampusLinks, campuses] = await Promise.all([
      this.prisma.order.findMany({ where: { createdAt: { gte: since } }, select: { vendorId: true, status: true } }),
      this.prisma.orderStatusHistory.findMany({
        where: { newStatus: 'ACCEPTED', order: { createdAt: { gte: since } } },
        select: { createdAt: true, order: { select: { vendorId: true, createdAt: true } } },
      }),
      this.prisma.vendor.findMany({ select: { id: true, canteenName: true } }),
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

    type Stats = { orders: number; decided: number; accepted: number; refused: number; cancelled: number };
    const statsByVendor = new Map<string, Stats>();
    for (const o of orders) {
      const entry = statsByVendor.get(o.vendorId) ?? { orders: 0, decided: 0, accepted: 0, refused: 0, cancelled: 0 };
      entry.orders += 1;
      if (DECISION_STATUSES.includes(o.status)) {
        entry.decided += 1;
        if (ACCEPTED_LINEAGE_STATUSES.includes(o.status)) entry.accepted += 1;
        if (o.status === 'REFUSED') entry.refused += 1;
        if (o.status === 'CANCELLED_VENDOR') entry.cancelled += 1;
      }
      statsByVendor.set(o.vendorId, entry);
    }

    const acceptanceTimesByVendor = new Map<string, number[]>();
    let allAcceptanceTimes: number[] = [];
    for (const e of acceptanceEvents) {
      const vendorId = e.order.vendorId;
      const seconds = (e.createdAt.getTime() - e.order.createdAt.getTime()) / 1000;
      if (!acceptanceTimesByVendor.has(vendorId)) acceptanceTimesByVendor.set(vendorId, []);
      acceptanceTimesByVendor.get(vendorId)!.push(seconds);
      allAcceptanceTimes.push(seconds);
    }

    const avg = (arr: number[]) => (arr.length > 0 ? arr.reduce((s, v) => s + v, 0) / arr.length : null);

    const rows = vendors
      .map((v) => {
        const stats = statsByVendor.get(v.id) ?? { orders: 0, decided: 0, accepted: 0, refused: 0, cancelled: 0 };
        const avgSeconds = avg(acceptanceTimesByVendor.get(v.id) ?? []);
        let status: 'green' | 'orange' | 'red' = 'green';
        if (avgSeconds !== null) {
          if (avgSeconds > ALERT_THRESHOLD_SECONDS) status = 'red';
          else if (avgSeconds > WATCH_THRESHOLD_SECONDS) status = 'orange';
        }
        return {
          id: v.id,
          name: v.canteenName,
          campusName: campusNamesByVendor.get(v.id)?.join(', ') ?? '—',
          orders: stats.orders,
          acceptanceRate: stats.decided > 0 ? Math.round((stats.accepted / stats.decided) * 100) : 0,
          refusalRate: stats.decided > 0 ? Math.round((stats.refused / stats.decided) * 100) : 0,
          cancellationRate: stats.decided > 0 ? Math.round((stats.cancelled / stats.decided) * 100) : 0,
          avgAcceptanceSeconds: avgSeconds,
          status,
        };
      })
      .filter((v) => v.orders > 0)
      .sort((a, b) => (a.avgAcceptanceSeconds ?? 0) - (b.avgAcceptanceSeconds ?? 0));

    const totalDecided = rows.reduce((s, v) => s + (statsByVendor.get(v.id)?.decided ?? 0), 0);
    const totalAccepted = rows.reduce((s, v) => s + (statsByVendor.get(v.id)?.accepted ?? 0), 0);
    const overallAcceptance = totalDecided > 0 ? Math.round((totalAccepted / totalDecided) * 100) : 0;
    const overallAvgSeconds = avg(allAcceptanceTimes);

    return {
      summary: {
        activeVendors: rows.length,
        totalVendors: vendors.length,
        avgAcceptanceRate: overallAcceptance,
        avgAcceptanceSeconds: overallAvgSeconds,
        watchCount: rows.filter((v) => v.status === 'orange').length,
        alertCount: rows.filter((v) => v.status === 'red').length,
      },
      vendors: rows,
    };
  }

  async getStudentBehavior(days = 30) {
    const since = daysAgo(days);
    const prevSince = daysAgo(days * 2);
    const sevenDaysAgo = daysAgo(7);

    const [allStudents, ordersWindow, paymentsWindow, newStudents7d, campuses] = await Promise.all([
      this.prisma.user.findMany({ where: { role: 'STUDENT' }, select: { id: true, campusId: true } }),
      this.prisma.order.findMany({
        where: { createdAt: { gte: prevSince } },
        select: { createdAt: true, studentId: true, student: { select: { campusId: true } } },
      }),
      this.prisma.payment.findMany({
        where: { status: 'SUCCESS', createdAt: { gte: since } },
        select: { amountFcfa: true, userId: true, user: { select: { campusId: true } } },
      }),
      this.prisma.user.findMany({
        where: { role: 'STUDENT', createdAt: { gte: sevenDaysAgo } },
        select: { createdAt: true },
      }),
      this.prisma.campus.findMany({ select: { id: true, name: true } }),
    ]);

    const enrolledByCampus = new Map<string, number>();
    for (const s of allStudents) if (s.campusId) enrolledByCampus.set(s.campusId, (enrolledByCampus.get(s.campusId) ?? 0) + 1);

    const activeIdsCurrent = new Set<string>();
    const activeIdsPrevious = new Set<string>();
    const activeIdsByCampus = new Map<string, Set<string>>();
    const ordersCountWindowByStudent = new Map<string, number>();

    for (const o of ordersWindow) {
      const isCurrentWindow = o.createdAt >= since;
      if (isCurrentWindow) {
        activeIdsCurrent.add(o.studentId);
        ordersCountWindowByStudent.set(o.studentId, (ordersCountWindowByStudent.get(o.studentId) ?? 0) + 1);
        const campusId = o.student?.campusId;
        if (campusId) {
          if (!activeIdsByCampus.has(campusId)) activeIdsByCampus.set(campusId, new Set());
          activeIdsByCampus.get(campusId)!.add(o.studentId);
        }
      } else {
        activeIdsPrevious.add(o.studentId);
      }
    }

    const totalOrdersInWindow = [...ordersCountWindowByStudent.values()].reduce((s, v) => s + v, 0);
    const weeks = days / 7;
    const avgFrequency = activeIdsCurrent.size > 0 ? totalOrdersInWindow / activeIdsCurrent.size / weeks : 0;

    const rechargeSumByCampus = new Map<string, { sum: number; count: number }>();
    let totalRechargeSum = 0;
    let totalRechargeCount = 0;
    for (const p of paymentsWindow) {
      totalRechargeSum += Number(p.amountFcfa);
      totalRechargeCount += 1;
      const campusId = p.user?.campusId;
      if (campusId) {
        const entry = rechargeSumByCampus.get(campusId) ?? { sum: 0, count: 0 };
        entry.sum += Number(p.amountFcfa);
        entry.count += 1;
        rechargeSumByCampus.set(campusId, entry);
      }
    }

    const dayKeys: string[] = [];
    for (let i = 6; i >= 0; i--) dayKeys.push(dayKey(daysAgo(i)));
    const dailyRegistrations = new Array(7).fill(0);
    for (const s of newStudents7d) {
      const idx = dayKeys.indexOf(dayKey(s.createdAt));
      if (idx !== -1) dailyRegistrations[idx] += 1;
    }

    const activePrevChange =
      activeIdsPrevious.size > 0
        ? Math.round(((activeIdsCurrent.size - activeIdsPrevious.size) / activeIdsPrevious.size) * 100)
        : null;

    const perCampus = campuses.map((c) => {
      const enrolled = enrolledByCampus.get(c.id) ?? 0;
      const active = activeIdsByCampus.get(c.id)?.size ?? 0;
      const recharge = rechargeSumByCampus.get(c.id) ?? { sum: 0, count: 0 };
      const campusOrders = ordersWindow.filter((o) => o.createdAt >= since && o.student?.campusId === c.id).length;
      return {
        id: c.id,
        name: c.name,
        enrolled,
        active,
        avgRecharge: recharge.count > 0 ? Math.round(recharge.sum / recharge.count) : 0,
        avgFrequency: active > 0 ? Number((campusOrders / active / weeks).toFixed(1)) : 0,
      };
    });

    return {
      summary: {
        totalEnrolled: allStudents.length,
        totalActive: activeIdsCurrent.size,
        activeChangePct: activePrevChange,
        activeShare: allStudents.length > 0 ? Math.round((activeIdsCurrent.size / allStudents.length) * 100) : 0,
        avgRecharge: totalRechargeCount > 0 ? Math.round(totalRechargeSum / totalRechargeCount) : 0,
        avgFrequency: Number(avgFrequency.toFixed(1)),
      },
      dailyRegistrations: { labels: dayKeys, values: dailyRegistrations },
      perCampus,
    };
  }

  async getVendorFinancials(days = 30) {
    const since = daysAgo(days);

    const [vendors, vendorCampusLinks, campuses, withdrawals] = await Promise.all([
      this.prisma.vendor.findMany({
        where: { deletedAt: null },
        select: { id: true, canteenName: true, balanceFcfa: true, debtFcfa: true },
      }),
      this.prisma.vendorCampus.findMany({ select: { vendorId: true, campusId: true } }),
      this.prisma.campus.findMany({ select: { id: true, name: true } }),
      this.prisma.withdrawal.findMany({
        where: { status: 'COMPLETED', createdAt: { gte: since } },
        select: { vendorId: true },
      }),
    ]);

    const campusNameById = new Map(campuses.map((c) => [c.id, c.name]));
    const campusNamesByVendor = new Map<string, string[]>();
    for (const link of vendorCampusLinks) {
      if (!campusNamesByVendor.has(link.vendorId)) campusNamesByVendor.set(link.vendorId, []);
      const name = campusNameById.get(link.campusId);
      if (name) campusNamesByVendor.get(link.vendorId)!.push(name);
    }

    const withdrawalsCountByVendor = new Map<string, number>();
    for (const w of withdrawals) {
      withdrawalsCountByVendor.set(w.vendorId, (withdrawalsCountByVendor.get(w.vendorId) ?? 0) + 1);
    }

    const rows = vendors.map((v) => ({
      id: v.id,
      name: v.canteenName,
      campusName: campusNamesByVendor.get(v.id)?.join(', ') ?? '—',
      balance: Number(v.balanceFcfa),
      debt: Number(v.debtFcfa),
      withdrawals30d: withdrawalsCountByVendor.get(v.id) ?? 0,
      blocked: Number(v.debtFcfa) > 0,
    }));

    return {
      summary: {
        totalBalance: rows.reduce((s, v) => s + v.balance, 0),
        totalDebt: rows.reduce((s, v) => s + v.debt, 0),
        blockedCount: rows.filter((v) => v.blocked).length,
      },
      vendors: rows,
    };
  }

  // ─── Nouveau : Qualité & avis (Notes & alertes + Commentaires) ────
  async getReviewsQuality(days = 30) {
    const since = daysAgo(days);
    const sevenDaysAgo = daysAgo(7);

    const [reviewsWindow, reviews7d, vendors, vendorCampusLinks, campuses] = await Promise.all([
      this.prisma.review.findMany({
        where: { deletedAt: null, createdAt: { gte: since } },
        select: { rating: true, vendorId: true, createdAt: true },
      }),
      this.prisma.review.findMany({
        where: { deletedAt: null, createdAt: { gte: sevenDaysAgo } },
        select: { rating: true, createdAt: true },
      }),
      this.prisma.vendor.findMany({ select: { id: true, canteenName: true } }),
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

    const distribution: Record<number, number> = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
    let sumRating = 0;
    const statsByVendor = new Map<string, { sum: number; count: number }>();

    for (const r of reviewsWindow) {
      distribution[r.rating] = (distribution[r.rating] ?? 0) + 1;
      sumRating += r.rating;
      const entry = statsByVendor.get(r.vendorId) ?? { sum: 0, count: 0 };
      entry.sum += r.rating;
      entry.count += 1;
      statsByVendor.set(r.vendorId, entry);
    }

    const perVendor = vendors
      .map((v) => {
        const stats = statsByVendor.get(v.id) ?? { sum: 0, count: 0 };
        const avgRating = stats.count > 0 ? Number((stats.sum / stats.count).toFixed(1)) : null;
        return {
          id: v.id,
          name: v.canteenName,
          campusName: campusNamesByVendor.get(v.id)?.join(', ') ?? '—',
          avgRating,
          reviewCount: stats.count,
          alert: avgRating !== null && avgRating < RATING_ALERT_THRESHOLD,
        };
      })
      .filter((v) => v.reviewCount > 0)
      .sort((a, b) => (a.avgRating ?? 5) - (b.avgRating ?? 5));

    const dayKeys: string[] = [];
    for (let i = 6; i >= 0; i--) dayKeys.push(dayKey(daysAgo(i)));
    const dailySum = new Array(7).fill(0);
    const dailyCount = new Array(7).fill(0);
    for (const r of reviews7d) {
      const idx = dayKeys.indexOf(dayKey(r.createdAt));
      if (idx === -1) continue;
      dailySum[idx] += r.rating;
      dailyCount[idx] += 1;
    }
    const dailyAvg = dailySum.map((sum, i) => (dailyCount[i] > 0 ? Number((sum / dailyCount[i]).toFixed(1)) : null));

    return {
      summary: {
        avgRating: reviewsWindow.length > 0 ? Number((sumRating / reviewsWindow.length).toFixed(1)) : null,
        totalReviews: reviewsWindow.length,
        alertCount: perVendor.filter((v) => v.alert).length,
      },
      distribution: Object.entries(distribution).map(([rating, count]) => ({
        rating: Number(rating),
        label: RATING_LABELS[Number(rating)],
        count,
      })),
      perVendor,
      dailyTrend: { labels: dayKeys, avgRating: dailyAvg, count: dailyCount },
    };
  }
}