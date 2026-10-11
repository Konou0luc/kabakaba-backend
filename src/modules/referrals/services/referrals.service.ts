import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../../database/services/prisma.service';

@Injectable()
export class ReferralsService {
  constructor(private readonly prisma: PrismaService) {}

  /** Code de l'utilisateur et bilan de ses parrainages. */
  async getMine(userId: string) {
    const [user, referredCount, rewarded] = await Promise.all([
      this.prisma.user.findFirst({
        where: { id: userId, deletedAt: null },
        select: { referralCode: true },
      }),
      this.prisma.referral.count({ where: { referrerId: userId } }),
      this.prisma.referral.aggregate({
        where: { referrerId: userId, rewardedAt: { not: null } },
        _count: { _all: true },
        _sum: { rewardTickets: true },
      }),
    ]);
    if (!user) throw new NotFoundException('Utilisateur introuvable');

    return {
      referralCode: user.referralCode,
      referredCount,
      rewardedCount: rewarded._count._all,
      totalRewardTickets: rewarded._sum.rewardTickets ?? 0,
    };
  }
}
