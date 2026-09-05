import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../../database/services/prisma.service';
import { platformCoveredWithdrawalFee } from '../../vendors/pricing/withdrawal-fees';
import {
  COMMISSION_RATE_BY_LEVEL,
  LEVEL_VOLUME_THRESHOLDS,
} from '../../ambassadors/pricing/ambassador-commission';

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

/**
 * Résout la plage de dates à utiliser pour une requête analytics.
 * - Si `from`/`to` sont fournis (calendrier de la Vue générale), on les
 *   utilise tels quels (bornes incluses, `to` étendu à la fin de journée).
 * - Sinon, comportement historique : les `days` derniers jours jusqu'à maintenant.
 * La période précédente (`prevSince`/`prevUntil`) est une fenêtre de même
 * durée, immédiatement avant la période sélectionnée — utilisée pour les
 * comparaisons ("vs période précédente").
 */
function resolveRange(days = 30, from?: string, to?: string) {
  if (from) {
    const since = new Date(from);
    const until = to ? new Date(to) : new Date();
    // Étend la borne de fin à 23:59:59.999 pour inclure toute la journée choisie
    until.setHours(23, 59, 59, 999);
    const durationMs = until.getTime() - since.getTime();
    const prevUntil = new Date(since.getTime() - 1);
    const prevSince = new Date(prevUntil.getTime() - durationMs);
    return { since, until, prevSince, prevUntil };
  }

  const since = daysAgo(days);
  const until = new Date();
  const prevSince = daysAgo(days * 2);
  const prevUntil = since;
  return { since, until, prevSince, prevUntil };
}

function dayKey(d: Date) {
  return d.toISOString().slice(0, 10);
}

// Plafond de sécurité : au-delà, un graphique à 1 barre/jour deviendrait
// illisible et le payload trop lourd. Sur une période plus longue, on
// affiche les MAX_DAILY_BUCKETS derniers jours de la période choisie.
const MAX_DAILY_BUCKETS = 92;

/**
 * Construit la liste des clés de jour (YYYY-MM-DD) couvrant TOUTE la
 * période sélectionnée (since -> until), au lieu d'une fenêtre fixe de
 * "7 derniers jours calendaires" indépendante du filtre choisi par
 * l'utilisateur. Utilisé par tous les graphiques "évolution journalière"
 * de la supervision (Vue générale, Volume & revenus, Comportement
 * étudiants, Notes & alertes) pour qu'ils s'adaptent au calendrier choisi.
 */
function buildDayKeys(since: Date, until: Date): string[] {
  const start = new Date(since);
  start.setHours(0, 0, 0, 0);
  const end = new Date(until);
  end.setHours(0, 0, 0, 0);

  const totalDays = Math.max(1, Math.round((end.getTime() - start.getTime()) / (24 * 60 * 60 * 1000)) + 1);
  const daysToShow = Math.min(totalDays, MAX_DAILY_BUCKETS);

  const keys: string[] = [];
  const cursor = new Date(end);
  for (let i = 0; i < daysToShow; i++) {
    keys.push(dayKey(cursor));
    cursor.setDate(cursor.getDate() - 1);
  }
  return keys.reverse();
}


@Injectable()
export class AnalyticsService {
  constructor(private readonly prisma: PrismaService) {}

  async getCampusComparison(days = 30, from?: string, to?: string) {
    const { since, until, prevSince, prevUntil } = resolveRange(days, from, to);
    const dayKeys = buildDayKeys(since, until);
    const chartStart = new Date(dayKeys[0]);

    const [campuses, students, ordersWindow, ordersPrevWindow, ordersForChart, vendorCampusLinks] = await Promise.all([
      this.prisma.campus.findMany({ orderBy: { name: 'asc' } }),
      this.prisma.user.findMany({ where: { role: 'STUDENT', campusId: { not: null } }, select: { id: true, campusId: true } }),
      this.prisma.order.findMany({
        where: { createdAt: { gte: since, lte: until } },
        select: { status: true, escrowAmount: true, studentId: true, student: { select: { campusId: true } } },
      }),
      this.prisma.order.findMany({ where: { createdAt: { gte: prevSince, lte: prevUntil } }, select: { status: true, escrowAmount: true } }),
      this.prisma.order.findMany({ where: { createdAt: { gte: chartStart, lte: until } }, select: { createdAt: true, student: { select: { campusId: true } } } }),
      this.prisma.vendorCampus.findMany({ select: { campusId: true, vendor: { select: { isActive: true } } } }),
    ]);

    const cantinesByCampus = new Map<string, number>();
    // Un campus est actif si au moins un vendeur qui y est rattaché a
    // isActive = true (pas un champ statique sur Campus — calculé ici).
    const hasActiveVendorByCampus = new Map<string, boolean>();
    for (const link of vendorCampusLinks) {
      cantinesByCampus.set(link.campusId, (cantinesByCampus.get(link.campusId) ?? 0) + 1);
      if (link.vendor.isActive) hasActiveVendorByCampus.set(link.campusId, true);
    }

    const enrolledByCampus = new Map<string, number>();
    for (const s of students) if (s.campusId) enrolledByCampus.set(s.campusId, (enrolledByCampus.get(s.campusId) ?? 0) + 1);

    const activeStudentIdsByCampus = new Map<string, Set<string>>();
    const statsByCampus = new Map<string, { orders: number; completed: number; revenue: number; decided: number; accepted: number }>();
    for (const o of ordersWindow) {
      const campusId = o.student?.campusId;
      if (!campusId) continue;
      if (!activeStudentIdsByCampus.has(campusId)) activeStudentIdsByCampus.set(campusId, new Set());
      activeStudentIdsByCampus.get(campusId)!.add(o.studentId);
      const entry = statsByCampus.get(campusId) ?? { orders: 0, completed: 0, revenue: 0, decided: 0, accepted: 0 };
      entry.orders += 1;
      if (COMPLETED_STATUSES.includes(o.status)) {
        entry.completed += 1;
        entry.revenue += Number(o.escrowAmount);
      }
      // Taux d'acceptation : parmi les commandes tranchées par le vendeur
      // (acceptées ou refusées — DECIDED_STATUSES), quelle proportion a été
      // acceptée (ACCEPTED_LINEAGE_STATUSES) ? Même définition que
      // getVendorPerformance, agrégée par campus plutôt que par vendeur.
      if (DECIDED_STATUSES.includes(o.status)) {
        entry.decided += 1;
        if (ACCEPTED_LINEAGE_STATUSES.includes(o.status)) entry.accepted += 1;
      }
      statsByCampus.set(campusId, entry);
    }

    let prevTotalOrders = 0;
    let prevTotalRevenue = 0;
    for (const o of ordersPrevWindow) {
      prevTotalOrders += 1;
      if (COMPLETED_STATUSES.includes(o.status)) prevTotalRevenue += Number(o.escrowAmount);
    }

    const dailyByCampus = new Map<string, number[]>();
    const dailyTotal = new Array(dayKeys.length).fill(0);
    for (const o of ordersForChart) {
      const idx = dayKeys.indexOf(dayKey(o.createdAt));
      if (idx === -1) continue;
      dailyTotal[idx] += 1;
      const campusId = o.student?.campusId;
      if (!campusId) continue;
      if (!dailyByCampus.has(campusId)) dailyByCampus.set(campusId, new Array(dayKeys.length).fill(0));
      dailyByCampus.get(campusId)![idx] += 1;
    }

    const campusRows = campuses.map((c) => {
      const stats = statsByCampus.get(c.id) ?? { orders: 0, completed: 0, revenue: 0, decided: 0, accepted: 0 };
      return {
        id: c.id,
        name: c.name,
        cantines: cantinesByCampus.get(c.id) ?? 0,
        orders: stats.orders,
        completionRate: stats.orders > 0 ? Math.round((stats.completed / stats.orders) * 100) : 0,
        acceptanceRate: stats.decided > 0 ? Math.round((stats.accepted / stats.decided) * 100) : 0,
        revenue: stats.revenue,
        enrolled: enrolledByCampus.get(c.id) ?? 0,
        active: activeStudentIdsByCampus.get(c.id)?.size ?? 0,
        isActive: hasActiveVendorByCampus.get(c.id) ?? false,
      };
    });

    return {
      summary: {
        activeCampuses: campusRows.filter((c) => c.isActive).length,
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
        series: { 'Tous les campus': dailyTotal, ...Object.fromEntries(campuses.map((c) => [c.name, dailyByCampus.get(c.id) ?? new Array(dayKeys.length).fill(0)])) },
      },
    };
  }

  async getTopCanteens(days = 30, limit = 10, from?: string, to?: string) {
    const { since, until } = resolveRange(days, from, to);
    const [orders, vendors, reviews, vendorCampusLinks, campuses] = await Promise.all([
      this.prisma.order.findMany({ where: { createdAt: { gte: since, lte: until } }, select: { vendorId: true, status: true } }),
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

  async getRevenueBreakdown(days = 30, from?: string, to?: string) {
    const { since, until } = resolveRange(days, from, to);
    const [payments, withdrawals, commissions, campuses, vendorCampusLinks] = await Promise.all([
      this.prisma.payment.findMany({
        where: { status: 'SUCCESS', createdAt: { gte: since, lte: until } },
        select: { operator: true, amountFcfa: true, ticketsReceived: true, createdAt: true, user: { select: { campusId: true } } },
      }),
      this.prisma.withdrawal.findMany({
        where: { status: 'COMPLETED', createdAt: { gte: since, lte: until } },
        select: { vendorId: true, amount: true, platformFee: true, operatorFee: true, createdAt: true },
      }),
      this.prisma.ambassadorCommission.findMany({
        where: { deletedAt: null, createdAt: { gte: since, lte: until } },
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
      const fee = platformCoveredWithdrawalFee(Number(w.amount), Number(w.platformFee), Number(w.operatorFee));
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
      // uncoveredFees = frais de retrait que la plateforme absorbe à la place du
      // vendeur (montant sous les seuils 10k/30k FCFA) : c'est un COÛT, donc on
      // le soustrait du surplus (et non l'inverse, comme c'était fait par erreur avant).
      return { id: c.id, name: c.name, rechargesGross: agg.rechargesGross, surplus: agg.surplus, commissions: agg.commissions, net: agg.surplus - agg.uncoveredFees - agg.commissions };
    });

    const dayKeys = buildDayKeys(since, until);
    const dailyNet = new Array(dayKeys.length).fill(0);
    for (const p of payments) {
      const idx = dayKeys.indexOf(dayKey(p.createdAt));
      if (idx === -1) continue;
      const rate = FEE_RATE_BY_OPERATOR[p.operator] ?? 0;
      dailyNet[idx] += Number(p.amountFcfa) - p.ticketsReceived / (1 - rate);
    }
    for (const w of withdrawals) {
      const idx = dayKeys.indexOf(dayKey(w.createdAt));
      if (idx === -1) continue;
      dailyNet[idx] -= platformCoveredWithdrawalFee(Number(w.amount), Number(w.platformFee), Number(w.operatorFee));
    }
    for (const c of commissions) {
      const idx = dayKeys.indexOf(dayKey(c.createdAt));
      if (idx === -1) continue;
      dailyNet[idx] -= Number(c.amount);
    }

    return {
      summary: { surplus: totalSurplus, uncoveredFees: totalUncoveredFees, commissions: totalCommissions, net: totalSurplus - totalUncoveredFees - totalCommissions, rechargesGross: totalGross },
      perCampus,
      dailyNet: { labels: dayKeys, values: dailyNet },
    };
  }

  async getVendorPerformance(days = 30, from?: string, to?: string) {
    const { since, until } = resolveRange(days, from, to);
    const [orders, acceptanceEvents, vendors, vendorCampusLinks, campuses] = await Promise.all([
      this.prisma.order.findMany({ where: { createdAt: { gte: since, lte: until } }, select: { vendorId: true, status: true } }),
      this.prisma.orderStatusHistory.findMany({
        where: { newStatus: 'ACCEPTED', order: { createdAt: { gte: since, lte: until } } },
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

  async getStudentBehavior(days = 30, from?: string, to?: string) {
    const { since, until, prevSince } = resolveRange(days, from, to);
    const dayKeys = buildDayKeys(since, until);
    const chartStart = new Date(dayKeys[0]);

    const [allStudents, ordersWindow, paymentsWindow, newStudentsForChart, campuses] = await Promise.all([
      this.prisma.user.findMany({ where: { role: 'STUDENT' }, select: { id: true, campusId: true } }),
      this.prisma.order.findMany({
        where: { createdAt: { gte: prevSince, lte: until } },
        select: { createdAt: true, studentId: true, student: { select: { campusId: true } } },
      }),
      this.prisma.payment.findMany({
        where: { status: 'SUCCESS', createdAt: { gte: since, lte: until } },
        select: { amountFcfa: true, userId: true, createdAt: true, user: { select: { campusId: true } } },
      }),
      this.prisma.user.findMany({
        where: { role: 'STUDENT', createdAt: { gte: chartStart, lte: until } },
        select: { createdAt: true },
      }),
      this.prisma.campus.findMany({ select: { id: true, name: true } }),
    ]);

    const enrolledByCampus = new Map<string, number>();
    for (const s of allStudents) if (s.campusId) enrolledByCampus.set(s.campusId, (enrolledByCampus.get(s.campusId) ?? 0) + 1);

    const activeIdsCurrent = new Set<string>();
    const activeIdsPrevious = new Set<string>();
    const activeIdsByCampus = new Map<string, Set<string>>();

    for (const o of ordersWindow) {
      const isCurrentWindow = o.createdAt >= since;
      if (isCurrentWindow) {
        activeIdsCurrent.add(o.studentId);
        const campusId = o.student?.campusId;
        if (campusId) {
          if (!activeIdsByCampus.has(campusId)) activeIdsByCampus.set(campusId, new Set());
          activeIdsByCampus.get(campusId)!.add(o.studentId);
        }
      } else {
        activeIdsPrevious.add(o.studentId);
      }
    }

    const rechargeSumByCampus = new Map<string, { sum: number; count: number }>();
    let totalRechargeSum = 0;
    let totalRechargeCount = 0;
    let minRecharge: number | null = null;
    let maxRecharge: number | null = null;
    for (const p of paymentsWindow) {
      const amount = Number(p.amountFcfa);
      totalRechargeSum += amount;
      totalRechargeCount += 1;
      if (minRecharge === null || amount < minRecharge) minRecharge = amount;
      if (maxRecharge === null || amount > maxRecharge) maxRecharge = amount;
      const campusId = p.user?.campusId;
      if (campusId) {
        const entry = rechargeSumByCampus.get(campusId) ?? { sum: 0, count: 0 };
        entry.sum += amount;
        entry.count += 1;
        rechargeSumByCampus.set(campusId, entry);
      }
    }

    const dailyRegistrations = new Array(dayKeys.length).fill(0);
    for (const s of newStudentsForChart) {
      const idx = dayKeys.indexOf(dayKey(s.createdAt));
      if (idx !== -1) dailyRegistrations[idx] += 1;
    }

    // Recharges sur la même fenêtre que le graphique d'inscriptions
    // (chartStart -> until), sous-ensemble de paymentsWindow déjà chargé.
    const dailyRecharges = new Array(dayKeys.length).fill(0);
    for (const p of paymentsWindow) {
      if (p.createdAt < chartStart) continue;
      const idx = dayKeys.indexOf(dayKey(p.createdAt));
      if (idx !== -1) dailyRecharges[idx] += Number(p.amountFcfa);
    }

    const activePrevChange =
      activeIdsPrevious.size > 0
        ? Math.round(((activeIdsCurrent.size - activeIdsPrevious.size) / activeIdsPrevious.size) * 100)
        : null;

    const perCampus = campuses.map((c) => {
      const enrolled = enrolledByCampus.get(c.id) ?? 0;
      const active = activeIdsByCampus.get(c.id)?.size ?? 0;
      const recharge = rechargeSumByCampus.get(c.id) ?? { sum: 0, count: 0 };
      return {
        id: c.id,
        name: c.name,
        enrolled,
        active,
        avgRecharge: recharge.count > 0 ? Math.round(recharge.sum / recharge.count) : 0,
      };
    });

    return {
      summary: {
        totalEnrolled: allStudents.length,
        totalActive: activeIdsCurrent.size,
        activeChangePct: activePrevChange,
        avgRecharge: totalRechargeCount > 0 ? Math.round(totalRechargeSum / totalRechargeCount) : 0,
        minRecharge: minRecharge ?? 0,
        maxRecharge: maxRecharge ?? 0,
      },
      dailyRegistrations: { labels: dayKeys, values: dailyRegistrations },
      dailyRecharges: { labels: dayKeys, values: dailyRecharges },
      perCampus,
    };
  }

  async getVendorFinancials(days = 30, from?: string, to?: string) {
    const { since, until } = resolveRange(days, from, to);

    const [vendors, vendorCampusLinks, campuses, withdrawals] = await Promise.all([
      this.prisma.vendor.findMany({
        where: { deletedAt: null },
        select: { id: true, canteenName: true, balanceFcfa: true, debtFcfa: true },
      }),
      this.prisma.vendorCampus.findMany({ select: { vendorId: true, campusId: true } }),
      this.prisma.campus.findMany({ select: { id: true, name: true } }),
      this.prisma.withdrawal.findMany({
        where: { status: 'COMPLETED', createdAt: { gte: since, lte: until } },
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

  async getReviewsQuality(days = 30, from?: string, to?: string) {
    const { since, until } = resolveRange(days, from, to);
    const dayKeys = buildDayKeys(since, until);
    const chartStart = new Date(dayKeys[0]);

    const [reviewsWindow, vendors, vendorCampusLinks, campuses] = await Promise.all([
      this.prisma.review.findMany({
        where: { deletedAt: null, createdAt: { gte: since, lte: until } },
        select: { rating: true, vendorId: true, createdAt: true },
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

    const dailySum = new Array(dayKeys.length).fill(0);
    const dailyCount = new Array(dayKeys.length).fill(0);
    for (const r of reviewsWindow) {
      if (r.createdAt < chartStart) continue;
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

  // ─── Nouveau : Supervision ambassadeurs ───────────────────────────
  // Inclut ACTIVE et SUSPENDED : la liste admin doit pouvoir afficher les
  // deux (avec un badge de statut), contrairement à un classement public
  // qui ne montrerait que les actifs.
  async getAmbassadorRanking(days = 30, from?: string, to?: string) {
    const { since, until } = resolveRange(days, from, to);

    const [ambassadors, affiliateCounts, activeAffiliateRows, commissionsWindow] = await Promise.all([
      this.prisma.ambassador.findMany({
        where: { deletedAt: null, status: { in: ['ACTIVE', 'SUSPENDED'] } },
        select: {
          id: true,
          level: true,
          status: true,
          volume30d: true,
          promoCode: true,
          user: { select: { firstName: true, lastName: true, phone: true, campus: { select: { name: true } } } },
        },
      }),
      this.prisma.ambassadorAffiliate.groupBy({
        by: ['ambassadorId'],
        where: { deletedAt: null },
        _count: { _all: true },
      }),
      // Affilié "actif" = a effectué au moins une recharge réussie sur la
      // période analysée. C'est sur les recharges (Payment), pas sur les
      // commandes, que les commissions ambassadeur sont calculées
      // (AmbassadorCommission.paymentId) — c'est donc le bon signal
      // d'activité, cohérent avec la fiche détail d'un ambassadeur.
      this.prisma.ambassadorAffiliate.findMany({
        where: {
          deletedAt: null,
          student: { payments: { some: { status: 'SUCCESS', createdAt: { gte: since, lte: until } } } },
        },
        select: { ambassadorId: true },
      }),
      this.prisma.ambassadorCommission.findMany({
        where: { deletedAt: null, createdAt: { gte: since, lte: until } },
        select: { ambassadorId: true, amount: true },
      }),
    ]);

    const affiliateCountByAmbassador = new Map(affiliateCounts.map((a) => [a.ambassadorId, a._count._all]));
    const activeAffiliateCountByAmbassador = new Map<string, number>();
    for (const row of activeAffiliateRows) {
      activeAffiliateCountByAmbassador.set(
        row.ambassadorId,
        (activeAffiliateCountByAmbassador.get(row.ambassadorId) ?? 0) + 1,
      );
    }
    const commissionByAmbassador = new Map<string, number>();
    for (const c of commissionsWindow) {
      commissionByAmbassador.set(c.ambassadorId, (commissionByAmbassador.get(c.ambassadorId) ?? 0) + Number(c.amount));
    }

    const rows = ambassadors
      .map((a) => ({
        id: a.id,
        name: `${a.user?.firstName ?? ''} ${a.user?.lastName ?? ''}`.trim() || '—',
        phone: a.user?.phone ?? null,
        campusName: a.user?.campus?.name ?? '—',
        level: a.level,
        status: a.status,
        affiliates: affiliateCountByAmbassador.get(a.id) ?? 0,
        activeAffiliates: activeAffiliateCountByAmbassador.get(a.id) ?? 0,
        volume: Number(a.volume30d),
        commission: commissionByAmbassador.get(a.id) ?? 0,
      }))
      .sort((a, b) => b.volume - a.volume)
      .map((row, i) => ({ rank: i + 1, ...row }));

    const levelCounts = { GOLD: 0, SILVER: 0, BRONZE: 0 };
    const activeAmbassadors = ambassadors.filter((a) => a.status === 'ACTIVE');
    for (const a of activeAmbassadors) levelCounts[a.level] = (levelCounts[a.level] ?? 0) + 1;
    const suspendedCount = ambassadors.length - activeAmbassadors.length;

    const campusSet = new Set(ambassadors.map((a) => a.user?.campus?.name).filter(Boolean));

    return {
      summary: {
        activeAmbassadors: activeAmbassadors.length,
        suspendedAmbassadors: suspendedCount,
        campusCount: campusSet.size,
        totalVolume: rows.reduce((s, r) => s + r.volume, 0),
        totalCommission: rows.reduce((s, r) => s + r.commission, 0),
        levelCounts,
      },
      ranking: rows,
    };
  }

  async getAmbassadorDetail(id: string, days = 30, from?: string, to?: string) {
    const { since, until } = resolveRange(days, from, to);

    const ambassador = await this.prisma.ambassador.findUnique({
      where: { id, deletedAt: null },
      include: {
        user: { include: { campus: { select: { name: true } } } },
      },
    });

    if (!ambassador) throw new NotFoundException(`Ambassadeur ${id} introuvable`);

    const [affiliates, commissions, affiliateCount, appeals, commissionByAffiliateRows] = await Promise.all([
      this.prisma.ambassadorAffiliate.findMany({
        where: { ambassadorId: id, deletedAt: null },
        include: { student: { select: { firstName: true, lastName: true, campus: { select: { name: true } } } } },
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.ambassadorCommission.findMany({
        where: { ambassadorId: id, deletedAt: null },
        orderBy: { createdAt: 'desc' },
        take: 50,
        include: { payment: { select: { amountFcfa: true, createdAt: true } } },
      }),
      this.prisma.ambassadorAffiliate.count({ where: { ambassadorId: id, deletedAt: null } }),
      this.prisma.ambassadorAppeal.findMany({
        where: { ambassadorId: id, deletedAt: null },
        orderBy: { createdAt: 'desc' },
      }),
      // Commission totale générée par chaque affilié (sur toute sa durée
      // de vie, pas seulement la fenêtre analysée) — affiche "combien cet
      // affilié a rapporté" dans l'onglet Affiliés.
      this.prisma.ambassadorCommission.groupBy({
        by: ['affiliateId'],
        where: { ambassadorId: id, deletedAt: null, affiliateId: { not: null } },
        _sum: { amount: true },
      }),
    ]);

    const studentIds = affiliates.map((a) => a.studentId);
    // "Recharges 30j" = recharges réussies dans la fenêtre analysée
    // uniquement (avant ce correctif, la somme portait sur toute la durée
    // de vie du compte, ce qui ne correspondait pas au libellé affiché).
    const rechargesByStudent = await this.prisma.payment.groupBy({
      by: ['userId'],
      where: { userId: { in: studentIds }, status: 'SUCCESS', createdAt: { gte: since, lte: until } },
      _sum: { amountFcfa: true },
    });
    const rechargeSumByStudent = new Map(rechargesByStudent.map((r) => [r.userId, Number(r._sum.amountFcfa ?? 0)]));
    const commissionSumByAffiliate = new Map(
      commissionByAffiliateRows.map((r) => [r.affiliateId as string, Number(r._sum.amount ?? 0)]),
    );
    const affiliateNameById = new Map(
      affiliates.map((a) => [a.id, `${a.student?.firstName ?? ''} ${a.student?.lastName ?? ''}`.trim() || '—']),
    );

    const commissionsInWindow = commissions.filter((c) => c.createdAt >= since && c.createdAt <= until);
    const commissionThisMonth = commissionsInWindow.reduce((s, c) => s + Number(c.amount), 0);

    const levelThresholds = {
      BRONZE: 0,
      SILVER: LEVEL_VOLUME_THRESHOLDS.SILVER,
      GOLD: LEVEL_VOLUME_THRESHOLDS.GOLD,
    };
    const nextLevel = ambassador.level === 'BRONZE' ? 'SILVER' : ambassador.level === 'SILVER' ? 'GOLD' : null;

    return {
      identity: {
        id: ambassador.id,
        firstName: ambassador.user?.firstName,
        lastName: ambassador.user?.lastName,
        phone: ambassador.user?.phone,
        email: ambassador.user?.email,
        avatarUrl: ambassador.user?.avatarUrl,
        campusName: ambassador.user?.campus?.name ?? '—',
        institution: ambassador.institution,
        faculty: ambassador.faculty,
        schoolCardUrl: ambassador.schoolCardUrl,
        promoCode: ambassador.promoCode,
        level: ambassador.level,
        status: ambassador.status,
        suspendedAt: ambassador.suspendedAt,
        decisionReason: ambassador.decisionReason,
        createdAt: ambassador.createdAt,
      },
      stats: {
        volume30d: Number(ambassador.volume30d),
        commissionRate: COMMISSION_RATE_BY_LEVEL[ambassador.level] ?? 0,
        commissionThisMonth,
        totalAffiliates: affiliateCount,
        activeAffiliates: affiliates.filter((a) => rechargeSumByStudent.get(a.studentId)).length,
        lastReferralAt: ambassador.lastReferralAt,
        levelThreshold: nextLevel ? levelThresholds[nextLevel] : null,
        nextLevel,
      },
      affiliates: affiliates.map((a) => ({
        id: a.id,
        studentId: a.studentId,
        name: affiliateNameById.get(a.id) ?? '—',
        campusName: a.student?.campus?.name ?? '—',
        since: a.createdAt,
        totalRecharge: rechargeSumByStudent.get(a.studentId) ?? 0,
        commissionGenerated: commissionSumByAffiliate.get(a.id) ?? 0,
        active: (rechargeSumByStudent.get(a.studentId) ?? 0) > 0,
      })),
      commissions: commissions.map((c) => ({
        id: c.id,
        date: c.createdAt,
        affiliateId: c.affiliateId,
        affiliateName: c.affiliateId ? (affiliateNameById.get(c.affiliateId) ?? '—') : '—',
        rechargeAmount: c.payment ? Number(c.payment.amountFcfa) : null,
        levelApplied: c.levelApplied,
        commissionRate: c.commissionRate ? Number(c.commissionRate) : null,
        amount: Number(c.amount),
      })),
      appeals: appeals.map((ap) => ({
        id: ap.id,
        reason: ap.reason,
        status: ap.status,
        createdAt: ap.createdAt,
      })),
    };
  }
}