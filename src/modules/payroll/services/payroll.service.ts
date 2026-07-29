import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { PrismaService } from '../../../database/services/prisma.service';
import { AnalyticsService } from '../../analytics/services/analytics.service';
import { PayrollTrigger } from '@prisma/client';

@Injectable()
export class PayrollService {
  private readonly logger = new Logger(PayrollService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly analyticsService: AnalyticsService,
  ) {}

  private async getOrCreatePlatformAccount() {
    const existing = await this.prisma.platformAccount.findFirst();
    if (existing) return existing;
    return this.prisma.platformAccount.create({ data: {} });
  }

  private async getOrCreateSchedule() {
    const existing = await this.prisma.payrollSchedule.findFirst();
    if (existing) return existing;
    return this.prisma.payrollSchedule.create({ data: {} });
  }

  async listPayoutConfig() {
    const webUsers = await this.prisma.webUser.findMany({
      where: { deletedAt: null, isActive: true },
      select: { id: true, firstName: true, lastName: true, role: true, payoutPercentage: true, balance: true },
      orderBy: { createdAt: 'asc' },
    });
    const platformAccount = await this.getOrCreatePlatformAccount();
    const schedule = await this.getOrCreateSchedule();

    const sumPercentage = webUsers.reduce((s, u) => s + Number(u.payoutPercentage), 0);

    return {
      accounts: webUsers,
      platformAccount,
      schedule,
      sumPercentage,
      platformPercentage: Math.max(0, 100 - sumPercentage),
    };
  }

  async setPayoutPercentage(webUserId: string, percentage: number) {
    const others = await this.prisma.webUser.findMany({
      where: { deletedAt: null, isActive: true, id: { not: webUserId } },
      select: { payoutPercentage: true },
    });
    const sumOthers = others.reduce((s, u) => s + Number(u.payoutPercentage), 0);

    if (sumOthers + percentage > 100) {
      throw new BadRequestException(
        `La somme des pourcentages dépasserait 100% (déjà ${sumOthers}% chez les autres comptes)`,
      );
    }

    return this.prisma.webUser.update({
      where: { id: webUserId },
      data: { payoutPercentage: percentage },
      select: { id: true, firstName: true, lastName: true, payoutPercentage: true },
    });
  }

  async setSchedule(isEnabled: boolean, dayOfMonth: number) {
    const schedule = await this.getOrCreateSchedule();
    return this.prisma.payrollSchedule.update({
      where: { id: schedule.id },
      data: { isEnabled, dayOfMonth },
    });
  }

  async listRuns(limit = 20) {
    return this.prisma.payrollRun.findMany({
      orderBy: { createdAt: 'desc' },
      take: limit,
      include: { entries: { include: { webUser: { select: { firstName: true, lastName: true } } } }, triggeredBy: { select: { firstName: true, lastName: true } } },
    });
  }

  /**
   * Calcule et crédite la paie pour une période donnée (par défaut : le mois
   * calendaire précédent, complet). Utilise exactement le "net" déjà calculé
   * par AnalyticsService.getRevenueBreakdown.
   */
  async runPayroll(triggeredById: string | null, trigger: PayrollTrigger, periodStart?: Date, periodEnd?: Date) {
    const now = new Date();
    const start = periodStart ?? new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const end = periodEnd ?? new Date(now.getFullYear(), now.getMonth(), 1);
    const days = Math.round((end.getTime() - start.getTime()) / (24 * 60 * 60 * 1000));

    // AnalyticsService.getRevenueBreakdown(days) travaille en fenêtre glissante
    // depuis maintenant — pour une période calendaire précise, on recalcule
    // ici directement plutôt que de réutiliser la fenêtre glissante.
    const netRevenue = await this.computeNetRevenueForPeriod(start, end);

    if (netRevenue <= 0) {
      if (trigger === PayrollTrigger.MANUAL) {
        throw new BadRequestException(
          `Revenu net nul ou négatif pour cette période (${netRevenue.toFixed(0)} FCFA) : aucune paie à distribuer.`,
        );
      }
      // Déclenchement automatique : on ne crée pas de run vide, juste un log.
      this.logger.log(`Paie automatique ignorée : revenu net = ${netRevenue.toFixed(0)} FCFA pour la période.`);
      return null;
    }

    const webUsers = await this.prisma.webUser.findMany({
      where: { deletedAt: null, isActive: true, payoutPercentage: { gt: 0 } },
    });
    const platformAccount = await this.getOrCreatePlatformAccount();
    const sumPercentage = webUsers.reduce((s, u) => s + Number(u.payoutPercentage), 0);
    const platformPercentage = Math.max(0, 100 - sumPercentage);

    return this.prisma.$transaction(async (tx) => {
      const run = await tx.payrollRun.create({
        data: { periodStart: start, periodEnd: end, netRevenue, trigger, triggeredById: triggeredById ?? undefined },
      });

      for (const u of webUsers) {
        const amount = (netRevenue * Number(u.payoutPercentage)) / 100;
        await tx.payrollRunEntry.create({
          data: { payrollRunId: run.id, webUserId: u.id, percentage: u.payoutPercentage, amount },
        });
        await tx.webUser.update({ where: { id: u.id }, data: { balance: { increment: amount } } });
      }

      const platformAmount = (netRevenue * platformPercentage) / 100;
      await tx.payrollRunEntry.create({
        data: { payrollRunId: run.id, webUserId: null, percentage: platformPercentage, amount: platformAmount },
      });
      await tx.platformAccount.update({ where: { id: platformAccount.id }, data: { balance: { increment: platformAmount } } });

      return tx.payrollRun.findUnique({ where: { id: run.id }, include: { entries: true } });
    });
  }

  private async computeNetRevenueForPeriod(start: Date, end: Date): Promise<number> {
    const FEE_RATE_BY_OPERATOR: Record<string, number> = { FLOOZ: 0.025, MIXX: 0.035 };

    const [payments, withdrawals, commissions] = await Promise.all([
      this.prisma.payment.findMany({
        where: { status: 'SUCCESS', createdAt: { gte: start, lt: end } },
        select: { operator: true, amountFcfa: true, ticketsReceived: true },
      }),
      this.prisma.withdrawal.findMany({
        where: { status: 'COMPLETED', createdAt: { gte: start, lt: end } },
        select: { amount: true, platformFee: true, operatorFee: true },
      }),
      this.prisma.ambassadorCommission.findMany({
        where: { deletedAt: null, createdAt: { gte: start, lt: end } },
        select: { amount: true },
      }),
    ]);

    let surplus = 0;
    for (const p of payments) {
      const rate = FEE_RATE_BY_OPERATOR[p.operator] ?? 0;
      surplus += Number(p.amountFcfa) - p.ticketsReceived / (1 - rate);
    }

    let uncoveredFees = 0;
    for (const w of withdrawals) {
      const amount = Number(w.amount);
      if (amount < 10000) uncoveredFees += Number(w.platformFee) + Number(w.operatorFee);
      else if (amount < 30000) uncoveredFees += Number(w.operatorFee);
    }

    const totalCommissions = commissions.reduce((s, c) => s + Number(c.amount), 0);

    return surplus + uncoveredFees - totalCommissions;
  }

  /**
   * Déclenchement planifié : vérifie chaque jour à 3h si la paie doit
   * partir aujourd'hui, selon PayrollSchedule.
   */
  @Cron('0 3 * * *')
  async handleScheduledPayroll() {
    const schedule = await this.getOrCreateSchedule();
    if (!schedule.isEnabled) return;

    const now = new Date();
    if (now.getDate() !== schedule.dayOfMonth) return;

    const alreadyRanToday =
      schedule.lastRunAt &&
      schedule.lastRunAt.getFullYear() === now.getFullYear() &&
      schedule.lastRunAt.getMonth() === now.getMonth();
    if (alreadyRanToday) return;

    this.logger.log('Déclenchement automatique de la paie mensuelle');
    await this.runPayroll(null, PayrollTrigger.SCHEDULED);
    await this.prisma.payrollSchedule.update({ where: { id: schedule.id }, data: { lastRunAt: now } });
  }
}