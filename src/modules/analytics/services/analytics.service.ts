import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../../database/services/prisma.service';
import { platformCoveredWithdrawalFee } from '../../vendors/pricing/withdrawal-fees';

const COMPLETED_STATUS = 'RECEIVED';
const CANCELLED_STATUS = 'CANCELLED';

const FEE_RATE_BY_OPERATOR: Record<string, number> = { FLOOZ: 0.025, MIXX: 0.035 };

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

  // Cache mémoire très court : les dashboards déclenchent souvent plusieurs
  // appels identiques lors d'une navigation rapide. En serverless, ce cache
  // profite uniquement aux instances chaudes et ne remplace jamais la DB.
  // Les données analytiques peuvent tolérer quelques secondes de fraîcheur.
  private readonly cache = new Map<string, { expiresAt: number; value: Promise<unknown> }>();
  private readonly analyticsCacheTtlMs = 10_000;

  private withCache<T>(key: string, factory: () => Promise<T>, ttlMs = this.analyticsCacheTtlMs): Promise<T> {
    const now = Date.now();
    const cached = this.cache.get(key);
    if (cached && cached.expiresAt > now) return cached.value as Promise<T>;
    const value = factory();
    this.cache.set(key, { expiresAt: now + ttlMs, value });
    value.catch(() => {
      const current = this.cache.get(key);
      if (current?.value === value) this.cache.delete(key);
    });
    return value;
  }

  async getCampusComparison(days = 30, from?: string, to?: string) { return this.withCache(`getCampusComparison:${days}:${from ?? ''}:${to ?? ''}`, () => this.getCampusComparisonUncached(days, from, to)); }
  async getTopCanteens(days = 30, limit = 10, from?: string, to?: string) { return this.withCache(`getTopCanteens:${days}:${limit}:${from ?? ''}:${to ?? ''}`, () => this.getTopCanteensUncached(days, limit, from, to)); }
  async getRevenueBreakdown(days = 30, from?: string, to?: string) { return this.withCache(`getRevenueBreakdown:${days}:${from ?? ''}:${to ?? ''}`, () => this.getRevenueBreakdownUncached(days, from, to)); }
  async getVendorPerformance(days = 30, from?: string, to?: string) { return this.withCache(`getVendorPerformance:${days}:${from ?? ''}:${to ?? ''}`, () => this.getVendorPerformanceUncached(days, from, to)); }
  async getStudentBehavior(days = 30, from?: string, to?: string) { return this.withCache(`getStudentBehavior:${days}:${from ?? ''}:${to ?? ''}`, () => this.getStudentBehaviorUncached(days, from, to)); }
  async getVendorFinancials(days = 30, from?: string, to?: string) { return this.withCache(`getVendorFinancials:${days}:${from ?? ''}:${to ?? ''}`, () => this.getVendorFinancialsUncached(days, from, to)); }
  async getReviewsQuality(days = 30, from?: string, to?: string) { return this.withCache(`getReviewsQuality:${days}:${from ?? ''}:${to ?? ''}`, () => this.getReviewsQualityUncached(days, from, to)); }

  private async getCampusComparisonUncached(days = 30, from?: string, to?: string) {
    const { since, until, prevSince, prevUntil } = resolveRange(days, from, to);
    const dayKeys = buildDayKeys(since, until);
    const chartStart = new Date(dayKeys[0]);

    const [campuses, students, ordersWindow, ordersPrevWindow, ordersForChart, vendorCampusLinks] = await Promise.all([
      this.prisma.campus.findMany({ orderBy: { name: 'asc' } }),
      this.prisma.user.findMany({ where: { role: 'STUDENT', campusId: { not: null } }, select: { id: true, campusId: true } }),
      this.prisma.order.findMany({
        where: { createdAt: { gte: since, lte: until } },
        select: { status: true, totalTickets: true, studentId: true, student: { select: { campusId: true } } },
      }),
      this.prisma.order.findMany({ where: { createdAt: { gte: prevSince, lte: prevUntil } }, select: { status: true, totalTickets: true } }),
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
    const statsByCampus = new Map<string, { orders: number; completed: number; cancelled: number; revenue: number }>();
    for (const o of ordersWindow) {
      const campusId = o.student?.campusId;
      if (!campusId) continue;
      if (!activeStudentIdsByCampus.has(campusId)) activeStudentIdsByCampus.set(campusId, new Set());
      activeStudentIdsByCampus.get(campusId)!.add(o.studentId);
      const entry = statsByCampus.get(campusId) ?? { orders: 0, completed: 0, cancelled: 0, revenue: 0 };
      entry.orders += 1;
      if (o.status === COMPLETED_STATUS) {
        entry.completed += 1;
        entry.revenue += o.totalTickets;
      } else if (o.status === CANCELLED_STATUS) {
        entry.cancelled += 1;
      }
      statsByCampus.set(campusId, entry);
    }

    let prevTotalOrders = 0;
    let prevTotalRevenue = 0;
    for (const o of ordersPrevWindow) {
      prevTotalOrders += 1;
      if (o.status === COMPLETED_STATUS) prevTotalRevenue += o.totalTickets;
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
      const stats = statsByCampus.get(c.id) ?? { orders: 0, completed: 0, cancelled: 0, revenue: 0 };
      return {
        id: c.id,
        name: c.name,
        cantines: cantinesByCampus.get(c.id) ?? 0,
        orders: stats.orders,
        // Taux de complétion : RECEIVED / (RECEIVED + CANCELLED).
        completionRate: stats.completed + stats.cancelled > 0 ? Math.round((stats.completed / (stats.completed + stats.cancelled)) * 100) : 0,
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

  private async getTopCanteensUncached(days = 30, limit = 10, from?: string, to?: string) {
    const { since, until } = resolveRange(days, from, to);
    const [orders, vendors, reviews, vendorCampusLinks, campuses] = await Promise.all([
      this.prisma.order.findMany({ where: { createdAt: { gte: since, lte: until } }, select: { vendorId: true } }),
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

    const ordersByVendor = new Map<string, number>();
    for (const o of orders) ordersByVendor.set(o.vendorId, (ordersByVendor.get(o.vendorId) ?? 0) + 1);

    const ratingsByVendor = new Map<string, { sum: number; count: number }>();
    for (const r of reviews) {
      const entry = ratingsByVendor.get(r.vendorId) ?? { sum: 0, count: 0 };
      entry.sum += r.rating;
      entry.count += 1;
      ratingsByVendor.set(r.vendorId, entry);
    }

    return vendors
      .map((v) => {
        const ratings = ratingsByVendor.get(v.id);
        return {
          id: v.id,
          name: v.canteenName,
          campusName: campusNamesByVendor.get(v.id)?.join(', ') ?? '—',
          orders: ordersByVendor.get(v.id) ?? 0,
          avgRating: ratings && ratings.count > 0 ? Number((ratings.sum / ratings.count).toFixed(1)) : null,
        };
      })
      .filter((v) => v.orders > 0)
      .sort((a, b) => b.orders - a.orders)
      .slice(0, limit);
  }

  private async getRevenueBreakdownUncached(days = 30, from?: string, to?: string) {
    const { since, until } = resolveRange(days, from, to);
    const [payments, withdrawals, campuses, vendorCampusLinks] = await Promise.all([
      this.prisma.payment.findMany({
        where: { status: 'SUCCESS', createdAt: { gte: since, lte: until } },
        select: { operator: true, amountFcfa: true, ticketsReceived: true, createdAt: true, user: { select: { campusId: true } } },
      }),
      this.prisma.withdrawal.findMany({
        where: { status: 'COMPLETED', createdAt: { gte: since, lte: until } },
        select: { vendorId: true, amount: true, platformFee: true, operatorFee: true, createdAt: true },
      }),
      this.prisma.campus.findMany({ select: { id: true, name: true } }),
      this.prisma.vendorCampus.findMany({ select: { vendorId: true, campusId: true } }),
    ]);

    const campusIdsByVendor = new Map<string, string[]>();
    for (const link of vendorCampusLinks) {
      if (!campusIdsByVendor.has(link.vendorId)) campusIdsByVendor.set(link.vendorId, []);
      campusIdsByVendor.get(link.vendorId)!.push(link.campusId);
    }

    type CampusAgg = { surplus: number; uncoveredFees: number; rechargesGross: number };
    const byCampus = new Map<string, CampusAgg>();
    const ensure = (id: string) => {
      if (!byCampus.has(id)) byCampus.set(id, { surplus: 0, uncoveredFees: 0, rechargesGross: 0 });
      return byCampus.get(id)!;
    };

    let totalSurplus = 0, totalUncoveredFees = 0, totalGross = 0;

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

    const perCampus = campuses.map((c) => {
      const agg = byCampus.get(c.id) ?? { surplus: 0, uncoveredFees: 0, rechargesGross: 0 };
      // uncoveredFees = frais de retrait que la plateforme absorbe à la place du
      // vendeur (montant sous les seuils 10k/30k FCFA) : c'est un COÛT, donc on
      // le soustrait du surplus (et non l'inverse, comme c'était fait par erreur avant).
      return { id: c.id, name: c.name, rechargesGross: agg.rechargesGross, surplus: agg.surplus, net: agg.surplus - agg.uncoveredFees };
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

    return {
      summary: { surplus: totalSurplus, uncoveredFees: totalUncoveredFees, net: totalSurplus - totalUncoveredFees, rechargesGross: totalGross },
      perCampus,
      dailyNet: { labels: dayKeys, values: dailyNet },
    };
  }

  private async getVendorPerformanceUncached(days = 30, from?: string, to?: string) {
    const { since, until } = resolveRange(days, from, to);
    const [orders, vendors, vendorCampusLinks, campuses] = await Promise.all([
      this.prisma.order.findMany({
        where: { createdAt: { gte: since, lte: until } },
        select: { vendorId: true, status: true, cancelledBy: true },
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

    // Commandes tranchées = RECEIVED ou CANCELLED. Annulation côté cantine =
    // annulée par la vendeuse ou par l'administrateur (pas par l'étudiant).
    type Stats = { orders: number; decided: number; cancelledBySide: number };
    const statsByVendor = new Map<string, Stats>();
    for (const o of orders) {
      const entry = statsByVendor.get(o.vendorId) ?? { orders: 0, decided: 0, cancelledBySide: 0 };
      entry.orders += 1;
      if (o.status === COMPLETED_STATUS || o.status === CANCELLED_STATUS) {
        entry.decided += 1;
        if (o.status === CANCELLED_STATUS && (o.cancelledBy === 'VENDOR' || o.cancelledBy === 'ADMIN')) {
          entry.cancelledBySide += 1;
        }
      }
      statsByVendor.set(o.vendorId, entry);
    }

    const rows = vendors
      .map((v) => {
        const stats = statsByVendor.get(v.id) ?? { orders: 0, decided: 0, cancelledBySide: 0 };
        return {
          id: v.id,
          name: v.canteenName,
          campusName: campusNamesByVendor.get(v.id)?.join(', ') ?? '—',
          orders: stats.orders,
          cancellationRate: stats.decided > 0 ? Math.round((stats.cancelledBySide / stats.decided) * 100) : 0,
        };
      })
      .filter((v) => v.orders > 0)
      .sort((a, b) => b.orders - a.orders);

    return {
      summary: {
        activeVendors: rows.length,
        totalVendors: vendors.length,
      },
      vendors: rows,
    };
  }

  private async getStudentBehaviorUncached(days = 30, from?: string, to?: string) {
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

  private async getVendorFinancialsUncached(days = 30, from?: string, to?: string) {
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

  private async getReviewsQualityUncached(days = 30, from?: string, to?: string) {
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
}
