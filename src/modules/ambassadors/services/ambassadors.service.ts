import { ConflictException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { AmbassadorLevel, AmbassadorStatus, NotificationType, PaymentStatus } from '@prisma/client';
import * as crypto from 'crypto';
import { PrismaService } from '../../../database/services/prisma.service';
import { CreateAmbassadorDto } from '../dto/create-ambassador.dto';
import { CreateSelfAmbassadorApplicationDto } from '../dto/create-self-ambassador-application.dto';
import { UpdateAmbassadorDto } from '../dto/update-ambassador.dto';
import {
  AMBASSADOR_INACTIVITY,
  levelFromVolume,
} from '../pricing/ambassador-commission';

@Injectable()
export class AmbassadorsService {
  private readonly logger = new Logger(AmbassadorsService.name);

  constructor(private readonly prisma: PrismaService) {}

  async create(createAmbassadorDto: CreateAmbassadorDto) {
    return this.prisma.ambassador.create({
      data: createAmbassadorDto,
    });
  }

  async createSelfApplication(
    userId: string,
    dto: CreateSelfAmbassadorApplicationDto,
  ) {
    const existing = await this.prisma.ambassador.findFirst({
      where: {
        userId,
        deletedAt: null,
      },
    });

    if (existing) {
      throw new ConflictException('Une candidature ou un profil ambassadeur existe déjà pour cet utilisateur.');
    }

    if (dto.promoCode) {
      const promoAlreadyUsed = await this.prisma.ambassador.findUnique({
        where: { promoCode: dto.promoCode },
      });

      if (promoAlreadyUsed) {
        throw new ConflictException('Ce code promo est déjà utilisé.');
      }
    }

    return this.prisma.ambassador.create({
      data: {
        userId,
        promoCode: dto.promoCode ?? null,
        level: AmbassadorLevel.BRONZE,
        status: AmbassadorStatus.PENDING,
        schoolCardUrl: dto.schoolCardUrl ?? null,
        institution: dto.institution ?? null,
        faculty: dto.faculty ?? null,
      },
    });
  }

  async findAll(
    page: number = 1,
    limit: number = 10,
    status?: AmbassadorStatus,
    level?: AmbassadorLevel,
  ) {
    const skip = (page - 1) * limit;
    const where = {
      deletedAt: null,
      ...(status ? { status } : {}),
      ...(level ? { level } : {}),
    };
    const [total, data] = await this.prisma.$transaction([
      this.prisma.ambassador.count({
        where,
      }),
      this.prisma.ambassador.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: {
          user: {
            select: { firstName: true, lastName: true, phone: true, email: true, createdAt: true, campus: { select: { name: true } } },
          },
        },
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

  async findOne(id: string) {
    const ambassador = await this.prisma.ambassador.findUnique({
      where: { id, deletedAt: null },
      include: {
        user: {
          select: { firstName: true, lastName: true, phone: true, email: true, campus: { select: { name: true } } },
        },
      },
    });

    if (!ambassador) throw new NotFoundException(`Ambassadeur avec l'identifiant ${id} introuvable`);

    return ambassador;
  }

  async findByUserId(userId: string) {
    const ambassador = await this.prisma.ambassador.findUnique({
      where: { userId, deletedAt: null },
    });

    if (!ambassador) throw new NotFoundException(`Ambassadeur pour l'utilisateur ${userId} introuvable`);

    return ambassador;
  }

  async update(id: string, updateAmbassadorDto: UpdateAmbassadorDto) {
    const existing = await this.findOne(id);

    let promoCode = updateAmbassadorDto.promoCode;
    // Le code promo n'est généré qu'à l'acceptation (cf. maquette DemandesAmbassadeur :
    // "Le code promo est généré uniquement à l'acceptation") : on ne l'auto-génère
    // que si le statut passe à ACTIVE et qu'aucun code n'existe déjà ou n'est fourni.
    if (updateAmbassadorDto.status === AmbassadorStatus.ACTIVE && !existing.promoCode && !promoCode) {
      promoCode = await this.generatePromoCode(existing.userId);
    }

    return this.prisma.ambassador.update({
      where: { id },
      data: {
        ...updateAmbassadorDto,
        ...(promoCode ? { promoCode } : {}),
      },
    });
  }

  private async generatePromoCode(userId: string): Promise<string> {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    const base = (user?.firstName || 'AMB').replace(/[^a-zA-Z]/g, '').slice(0, 3).toUpperCase() || 'AMB';
    const year = new Date().getFullYear();

    for (let attempt = 0; attempt < 5; attempt++) {
      const suffix = attempt === 0 ? '' : `-${crypto.randomInt(100, 1000)}`;
      const candidate = `${base}-${year}${suffix}`;
      const collision = await this.prisma.ambassador.findUnique({ where: { promoCode: candidate } });
      if (!collision) return candidate;
    }
    // Filet de sécurité si 5 tentatives se percutent toutes (extrêmement improbable)
    return `${base}-${year}-${Date.now().toString().slice(-4)}`;
  }

  async remove(id: string) {
    await this.findOne(id);
    return this.prisma.ambassador.update({
      where: { id },
      data: { deletedAt: new Date() },
    });
  }

  /**
   * CDC 10.3 / 10.5 — job quotidien (déclenché via POST /internal/cron/ambassador-daily).
   *
   * Pour chaque ambassadeur ACTIVE ou SUSPENDED :
   * 1. Recalcule volume30d = somme amountFcfa des paiements SUCCESS des affiliés
   *    sur les 30 derniers jours glissants.
   * 2. Met à jour le level (montée et descente, sans délai de grâce).
   * 3. Avertissement à 2 mois sans nouvel affilié ; suspension auto à 3 mois
   *    (uniquement pour les ACTIVE). Les SUSPENDED ne sont pas re-suspendus.
   *
   * Les notifications sont créées en base (push mobile branché ailleurs).
   */
  async recalculateDailyStats() {
    const since30d = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const suspendBefore = new Date(
      Date.now() - AMBASSADOR_INACTIVITY.SUSPENSION_DAYS * 24 * 60 * 60 * 1000,
    );

    const ambassadors = await this.prisma.ambassador.findMany({
      where: {
        deletedAt: null,
        status: { in: [AmbassadorStatus.ACTIVE, AmbassadorStatus.SUSPENDED] },
      },
      select: {
        id: true,
        userId: true,
        level: true,
        status: true,
        volume30d: true,
        lastReferralAt: true,
        createdAt: true,
      },
    });

    let updated = 0;
    let levelChanges = 0;
    let warnings = 0;
    let suspensions = 0;

    for (const ambassador of ambassadors) {
      const affiliates = await this.prisma.ambassadorAffiliate.findMany({
        where: { ambassadorId: ambassador.id, deletedAt: null },
        select: { studentId: true },
      });
      const studentIds = affiliates.map((a) => a.studentId);

      let volume30d = 0;
      if (studentIds.length > 0) {
        const agg = await this.prisma.payment.aggregate({
          where: {
            userId: { in: studentIds },
            status: PaymentStatus.SUCCESS,
            deletedAt: null,
            createdAt: { gte: since30d },
          },
          _sum: { amountFcfa: true },
        });
        volume30d = Math.round(Number(agg._sum.amountFcfa ?? 0));
      }

      const newLevel = levelFromVolume(volume30d);
      const data: {
        volume30d: number;
        level?: AmbassadorLevel;
        status?: AmbassadorStatus;
        suspendedAt?: Date;
      } = { volume30d };

      if (newLevel !== ambassador.level) {
        data.level = newLevel;
        levelChanges += 1;
        const rank = (l: AmbassadorLevel) =>
          [AmbassadorLevel.BRONZE, AmbassadorLevel.SILVER, AmbassadorLevel.GOLD].indexOf(l);
        const isPromotion = rank(newLevel) > rank(ambassador.level);
        await this.prisma.notification.create({
          data: {
            userId: ambassador.userId,
            title: 'Changement de niveau ambassadeur',
            message: `Votre niveau est passé de ${ambassador.level} à ${newLevel} (volume 30j : ${volume30d} FCFA).`,
            type: isPromotion ? NotificationType.SUCCESS : NotificationType.WARNING,
          },
        });
      }

      // Inactivité de parrainage : référence = lastReferralAt ou, à défaut, createdAt
      // (ambassadeur accepté qui n'a encore jamais parrainé).
      const referenceDate = ambassador.lastReferralAt ?? ambassador.createdAt;
      const daysSinceReferral =
        (Date.now() - referenceDate.getTime()) / (24 * 60 * 60 * 1000);

      if (ambassador.status === AmbassadorStatus.ACTIVE) {
        if (referenceDate <= suspendBefore) {
          data.status = AmbassadorStatus.SUSPENDED;
          data.suspendedAt = new Date();
          suspensions += 1;
          await this.prisma.notification.create({
            data: {
              userId: ambassador.userId,
              title: 'Compte ambassadeur suspendu',
              message:
                'Votre compte ambassadeur a été suspendu pour inactivité de parrainage (aucun nouvel affilié depuis 3 mois). Vous pouvez déposer un appel depuis l’application.',
              type: NotificationType.ERROR,
            },
          });
        } else if (daysSinceReferral >= AMBASSADOR_INACTIVITY.WARNING_DAYS && daysSinceReferral < AMBASSADOR_INACTIVITY.WARNING_DAYS + 1) {
          // Une seule notif le jour où le seuil des 2 mois est franchi.
          warnings += 1;
          await this.prisma.notification.create({
            data: {
              userId: ambassador.userId,
              title: 'Avertissement inactivité parrainage',
              message:
                'Vous n’avez invité aucun nouvel affilié depuis 2 mois. Sans nouveau parrainage sous 1 mois, votre compte ambassadeur sera suspendu.',
              type: NotificationType.WARNING,
            },
          });
        }
      }

      await this.prisma.ambassador.update({
        where: { id: ambassador.id },
        data,
      });
      updated += 1;
    }

    const summary = {
      processed: ambassadors.length,
      updated,
      levelChanges,
      warnings,
      suspensions,
      at: new Date().toISOString(),
    };
    this.logger.log(`Cron ambassador-daily terminé: ${JSON.stringify(summary)}`);
    return summary;
  }
}
