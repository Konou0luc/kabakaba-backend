import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../database/services/prisma.service';

const COMPLETED_STATUSES = ['RECEIVED', 'AUTO_RECEIVED'];
const DECIDED_STATUSES = ['RECEIVED', 'AUTO_RECEIVED', 'REFUSED', 'CANCELLED_VENDOR'];

function daysAgo(n: number) {
  return new Date(Date.now() - n * 24 * 60 * 60 * 1000);
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
      this.prisma.user.findMany({
        where: { role: 'STUDENT', campusId: { not: null } },
        select: { id: true, campusId: true },
      }),
      this.prisma.order.findMany({
        where: { createdAt: { gte: since } },
        select: {
          status: true,
          escrowAmount: true,
          studentId: true,
          student: { select: { campusId: true } },
        },
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
    for (let i = 6; i >= 0; i--) {
      dayKeys.push(daysAgo(i).toISOString().slice(0, 10));
    }
    const dailyByCampus = new Map<string, number[]>();
    const dailyTotal = new Array(7).fill(0);
    for (const o of orders7d) {
      const key = o.createdAt.toISOString().slice(0, 10);
      const idx = dayKeys.indexOf(key);
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

    const totalOrders = campusRows.reduce((s, c) => s + c.orders, 0);
    const totalRevenue = campusRows.reduce((s, c) => s + c.revenue, 0);
    const totalEnrolled = campusRows.reduce((s, c) => s + c.enrolled, 0);
    const totalActive = campusRows.reduce((s, c) => s + c.active, 0);

    return {
      summary: {
        activeCampuses: campuses.filter((c) => c.isActive).length,
        totalCampuses: campuses.length,
        totalOrders,
        totalOrdersPrevPeriod: prevTotalOrders,
        totalRevenue,
        totalRevenuePrevPeriod: prevTotalRevenue,
        totalStudents: totalEnrolled,
        activeStudents: totalActive,
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
    const since = daysAgo(days);

    const [orders, vendors, reviews, vendorCampusLinks, campuses] = await Promise.all([
      this.prisma.order.findMany({
        where: { createdAt: { gte: since } },
        select: { vendorId: true, status: true },
      }),
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
}