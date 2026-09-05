import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { SuspensionTrigger } from '@prisma/client';
import { PrismaService } from '../../../database/services/prisma.service';
import { SuspensionsService } from '../../users/services/suspensions.service';
import { CreateAbuseDto } from '../dto/create-abuse.dto';
import { UpdateAbuseDto } from '../dto/update-abuse.dto';

/** 3 annulations dans une fenêtre de 10 minutes → avertissement (1ère vague). */
const CANCEL_WINDOW_MS = 10 * 60 * 1000;
const CANCEL_THRESHOLD = 3;
/** Récidive après avertissement → suspension 24 h, fonds gelés (pas de débit tickets). */
const SUSPENSION_HOURS = 24;

@Injectable()
export class AbuseService {
  private readonly logger = new Logger(AbuseService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly suspensionsService: SuspensionsService,
  ) {}

  async create(createAbuseDto: CreateAbuseDto) {
    return this.prisma.abuseLog.create({
      data: createAbuseDto,
    });
  }

  async findAll(page: number = 1, limit: number = 10) {
    const skip = (page - 1) * limit;
    const [total, data] = await this.prisma.$transaction([
      this.prisma.abuseLog.count({
        where: { deletedAt: null },
      }),
      this.prisma.abuseLog.findMany({
        where: { deletedAt: null },
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

  async findOne(id: string) {
    const abuse = await this.prisma.abuseLog.findUnique({
      where: { id, deletedAt: null },
    });

    if (!abuse) throw new NotFoundException(`Journal d'abus avec l'identifiant ${id} introuvable`);

    return abuse;
  }

  async update(id: string, updateAbuseDto: UpdateAbuseDto) {
    await this.findOne(id);
    return this.prisma.abuseLog.update({
      where: { id },
      data: updateAbuseDto,
    });
  }

  async remove(id: string) {
    await this.findOne(id);
    return this.prisma.abuseLog.update({
      where: { id },
      data: { deletedAt: new Date() },
    });
  }

  /**
   * Enregistre une annulation imputable à l'étudiant.
   *
   * Règles produit (v2, hors CDC papier) :
   * 1. 3 annulations en 10 min → avertissement (compte encore utilisable).
   * 2. Nouvelle vague de 3 annulations en 10 min après avertissement →
   *    suspension 24 h : le JWT refuse l'accès → fonds gelés, aucune action
   *    mobile possible jusqu'à expiration (levée auto dans JwtStrategy).
   * 3. 3 suspensions sur 30 jours glissants → ban définitif
   *    (géré dans SuspensionsService, seuil = 3).
   *
   * Mobile et web partagent la même API : isSuspended / isBanned bloquent
   * toute route protégée côté étudiant.
   */
  async trackStudentCancellation(studentId: string) {
    const now = new Date();
    const windowStart = new Date(now.getTime() - CANCEL_WINDOW_MS);

    let log = await this.prisma.abuseLog.findFirst({
      where: {
        studentId,
        deletedAt: null,
        windowStart: { gte: windowStart },
      },
      orderBy: { createdAt: 'desc' },
    });

    if (!log) {
      log = await this.prisma.abuseLog.create({
        data: {
          studentId,
          count: 1,
          windowStart: now,
          warningSent: false,
        },
      });
      return { action: 'recorded' as const, count: 1, warningSent: false };
    }

    const newCount = log.count + 1;
    const alreadyWarned = log.warningSent;

    // 1ère vague : seuil atteint sans avertissement préalable
    if (newCount >= CANCEL_THRESHOLD && !alreadyWarned) {
      await this.prisma.abuseLog.update({
        where: { id: log.id },
        data: { count: newCount, warningSent: true },
      });
      await this.prisma.notification.create({
        data: {
          userId: studentId,
          title: 'Avertissement anti-abus',
          message:
            'Vous avez annulé 3 commandes en peu de temps. Si ce comportement se reproduit, votre compte sera suspendu 24 heures et vos fonds seront gelés pendant cette période.',
          type: 'WARNING',
        },
      });
      this.logger.warn(`Avertissement anti-abus envoyé à ${studentId}`);
      return { action: 'warning' as const, count: newCount, warningSent: true };
    }

    // Récidive après avertissement : nouvelle vague qui atteint le seuil
    if (newCount >= CANCEL_THRESHOLD && alreadyWarned) {
      await this.prisma.abuseLog.update({
        where: { id: log.id },
        data: { count: newCount },
      });

      const result = await this.applyRecidivismSuspension(studentId, log.id);
      return {
        action: result.banned ? ('banned' as const) : ('suspended' as const),
        count: newCount,
        warningSent: true,
        ...result,
      };
    }

    await this.prisma.abuseLog.update({
      where: { id: log.id },
      data: { count: newCount },
    });
    return { action: 'recorded' as const, count: newCount, warningSent: alreadyWarned };
  }

  /**
   * Suspension 24 h — aucun débit de tickets.
   * Les fonds restent sur le wallet mais sont inutilisables : JwtStrategy
   * refuse tout access token tant que isSuspended = true (gel effectif).
   * À l'expiration, la stratégie lève automatiquement la suspension.
   * 3 suspensions / 30 j → ban définitif (SuspensionsService).
   */
  private async applyRecidivismSuspension(studentId: string, abuseLogId: string) {
    const until = new Date(Date.now() + SUSPENSION_HOURS * 60 * 60 * 1000);

    const { banned, recentSuspensionCount } = await this.suspensionsService.suspend({
      studentId,
      reason:
        'Récidive anti-abus : annulations répétées après avertissement — suspension 24 h, fonds gelés',
      trigger: SuspensionTrigger.AUTOMATIC,
      ruleCode: 'ABUSE_CANCEL_RECIDIVISM',
      relatedAbuseLogId: abuseLogId,
      suspendedUntil: until,
      detectionMetadata: {
        freezeFunds: true,
        suspensionHours: SUSPENSION_HOURS,
        windowMinutes: 10,
      },
    });

    await this.prisma.notification.create({
      data: {
        userId: studentId,
        title: banned ? 'Compte banni définitivement' : 'Compte suspendu — fonds gelés',
        message: banned
          ? 'Votre compte a été banni définitivement suite à des suspensions répétées (3 en 30 jours). Contactez le support si vous pensez qu’il s’agit d’une erreur.'
          : `Votre compte est suspendu jusqu’au ${until.toISOString()}. Pendant cette période, vos fonds sont gelés : vous ne pouvez ni commander, ni transférer, ni recharger. L’accès sera rétabli automatiquement à la fin de la suspension.`,
        type: 'ERROR',
      },
    });

    this.logger.warn(
      `Anti-abus ${studentId}: suspension 24h jusqu’à ${until.toISOString()}` +
        (banned ? ' + BAN définitif' : ''),
    );

    return {
      suspended: true,
      banned,
      suspensionUntil: until,
      recentSuspensionCount,
      fundsFrozen: true,
    };
  }
}
