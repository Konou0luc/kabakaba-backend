import { BadRequestException, Injectable } from '@nestjs/common';
import { PrismaService } from '../../../database/services/prisma.service';
import { SuspensionStatus } from '@prisma/client';

interface Actor {
  id: string;
  kind: 'mobile' | 'web';
}

interface SuspendParams {
  studentId: string;
  reason: string;
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
    const { studentId, reason, suspendedUntil, actor } = params;

    const student = await this.prisma.user.findUnique({ where: { id: studentId } });
    if (!student) throw new BadRequestException('Étudiant introuvable');
    const [, event] = await this.prisma.$transaction([
      this.prisma.user.update({
        where: { id: studentId },
        data: {
          isSuspended: true,
          suspendedAt: new Date(),
          suspensionReason: reason,
          suspensionUntil: suspendedUntil ?? null,
        },
      }),
      this.prisma.suspensionEvent.create({
        data: {
          studentId,
          reason,
          suspendedUntil,
          suspendedByUserId: actor?.kind === 'mobile' ? actor.id : null,
          suspendedByWebUserId: actor?.kind === 'web' ? actor.id : null,
        },
      }),
      // Toute suspension invalide les sessions mobiles existantes.
      this.prisma.refreshToken.updateMany({
        where: { userId: studentId, revoked: false },
        data: { revoked: true },
      }),
    ]);

    return { event };
  }

  async lift(studentId: string, actor?: Actor) {
    const student = await this.prisma.user.findUnique({ where: { id: studentId } });
    if (!student) throw new BadRequestException('Étudiant introuvable');

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

  countLast30Days() {
    return this.prisma.suspensionEvent.count({ where: { suspendedAt: { gte: windowStart(30) } } });
  }

  async findAll(page = 1, limit = 20, status?: SuspensionStatus, studentId?: string) {
    const skip = (page - 1) * limit;
    const where = {
      ...(status ? { status } : {}),
      ...(studentId ? { studentId } : {}),
    };

    const [total, data] = await this.prisma.$transaction([
      this.prisma.suspensionEvent.count({ where }),
      this.prisma.suspensionEvent.findMany({
        where,
        skip,
        take: limit,
        orderBy: { suspendedAt: 'desc' },
        include: {
          student: { select: { id: true, firstName: true, lastName: true, phone: true, campus: { select: { id: true, name: true } } } },
        },
      }),
    ]);

    return {
      data,
      meta: { page, limit, total, totalPages: Math.ceil(total / limit) },
    };
  }
}