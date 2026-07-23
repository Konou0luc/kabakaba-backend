import { BadRequestException, Injectable } from '@nestjs/common';
import { PrismaService } from '../../../database/services/prisma.service';
import { Prisma, SuspensionStatus, SuspensionTrigger } from '@prisma/client';

const BAN_THRESHOLD = 5;
const BAN_WINDOW_DAYS = 30;

interface Actor {
  id: string;
  kind: 'mobile' | 'web';
}

interface SuspendParams {
  studentId: string;
  reason: string;
  trigger: SuspensionTrigger;
  ruleCode?: string;
  detectionMetadata?: Record<string, unknown>;
  relatedAbuseLogId?: string;
  suspendedUntil?: Date;
  actor?: Actor;
}

function windowStart(days: number) {
  return new Date(Date.now() - days * 24 * 60 * 60 * 1000);
}

@Injectable()
export class SuspensionsService {
  constructor(private readonly prisma: PrismaService) {}

  async suspend(params: SuspendParams) {
    const { studentId, reason, trigger, ruleCode, detectionMetadata, relatedAbuseLogId, suspendedUntil, actor } =
      params;

    const student = await this.prisma.user.findUnique({ where: { id: studentId } });
    if (!student) throw new BadRequestException('Étudiant introuvable');
    if (student.isBanned) throw new BadRequestException('Ce compte est déjà banni définitivement');

    const recentCount = await this.prisma.suspensionEvent.count({
      where: { studentId, suspendedAt: { gte: windowStart(BAN_WINDOW_DAYS) } },
    });
    const totalAfterThisOne = recentCount + 1;
    const shouldBan = totalAfterThisOne >= BAN_THRESHOLD;

    const [, event] = await this.prisma.$transaction([
      this.prisma.user.update({
        where: { id: studentId },
        data: {
          isSuspended: true,
          suspendedAt: new Date(),
          suspensionReason: reason,
          suspensionUntil: suspendedUntil ?? null,
          ...(shouldBan
            ? {
                isBanned: true,
                bannedAt: new Date(),
                banReason: `Bannissement automatique : ${totalAfterThisOne} suspensions en ${BAN_WINDOW_DAYS} jours`,
              }
            : {}),
        },
      }),
      this.prisma.suspensionEvent.create({
        data: {
          studentId,
          trigger,
          ruleCode,
          reason,
          detectionMetadata: detectionMetadata as Prisma.InputJsonValue | undefined,
          relatedAbuseLogId,
          suspendedUntil,
          suspendedByUserId: actor?.kind === 'mobile' ? actor.id : null,
          suspendedByWebUserId: actor?.kind === 'web' ? actor.id : null,
        },
      }),
    ]);

    return { event, banned: shouldBan, recentSuspensionCount: totalAfterThisOne };
  }

  async lift(studentId: string, actor?: Actor) {
    const student = await this.prisma.user.findUnique({ where: { id: studentId } });
    if (!student) throw new BadRequestException('Étudiant introuvable');
    if (student.isBanned) {
      throw new BadRequestException("Ce compte est banni définitivement — la levée normale ne s'applique pas");
    }

    await this.prisma.$transaction([
      this.prisma.user.update({
        where: { id: studentId },
        data: { isSuspended: false, suspendedAt: null },
      }),
      this.prisma.suspensionEvent.updateMany({
        where: { studentId, status: SuspensionStatus.ACTIVE },
        data: {
          status: SuspensionStatus.LIFTED,
          liftedAt: new Date(),
          liftedByUserId: actor?.kind === 'mobile' ? actor.id : null,
          liftedByWebUserId: actor?.kind === 'web' ? actor.id : null,
        },
      }),
    ]);
  }

  getHistory(studentId: string) {
    return this.prisma.suspensionEvent.findMany({
      where: { studentId },
      orderBy: { suspendedAt: 'desc' },
    });
  }

  countLast30Days() {
    return this.prisma.suspensionEvent.count({ where: { suspendedAt: { gte: windowStart(30) } } });
  }
}