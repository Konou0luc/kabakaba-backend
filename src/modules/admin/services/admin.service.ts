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
    const [
      totalUsers,
      totalVendors,
      totalOrders,
      totalPayments,
      totalTransactions,
      activeSuspensions,
      suspensions30d,
      totalBanned,
    ] = await Promise.all([
      this.prisma.user.count(),
      this.prisma.vendor.count(),
      this.prisma.order.count(),
      this.prisma.payment.count(),
      this.prisma.transaction.count(),
      this.prisma.user.count({ where: { isSuspended: true } }),
      this.suspensionsService.countLast30Days(),
      this.prisma.user.count({ where: { isBanned: true } }),
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
    };
  }
}