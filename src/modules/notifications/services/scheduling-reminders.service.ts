import { Injectable, Logger } from '@nestjs/common';
import { NotificationType, UserRole } from '@prisma/client';
import { PrismaService } from '../../../database/services/prisma.service';
import {
  SCHEDULING_REMINDER_BATCH_SIZE,
  SCHEDULING_REMINDER_CONCURRENCY,
  SCHEDULING_REMINDER_INTERVAL_DAYS,
  SCHEDULING_REMINDER_PASS_LIMIT,
} from '../scheduling-reminders.constants';
import { NotificationsService } from './notifications.service';

/**
 * Rappel « Programme ton repas » (CDC 41), envoyé tous les 3 jours aux étudiants actifs.
 * Actif : rôle étudiant, compte non supprimé et non suspendu. `lastSchedulingReminderAt`
 * mémorise le dernier rappel.
 */
@Injectable()
export class SchedulingRemindersService {
  private readonly logger = new Logger(SchedulingRemindersService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService,
  ) {}

  /**
   * Un passage : lit les étudiants à rappeler par lots, jusqu'au plafond du passage, notifie
   * chacun puis met `lastSchedulingReminderAt` à jour (aussitôt, étudiant par étudiant : un
   * passage interrompu garde ce qu'il a fait). L'échec d'un étudiant est isolé : le lot
   * continue, et l'étudiant n'est pas relu dans le même passage (lecture par curseur sur
   * l'identifiant). Renvoie le nombre de rappels envoyés.
   */
  async sendDueReminders(): Promise<number> {
    const now = new Date();
    const cutoff = new Date(now.getTime() - SCHEDULING_REMINDER_INTERVAL_DAYS * 24 * 3_600_000);

    let sent = 0;
    let failed = 0;
    let read = 0;
    let cursor: string | undefined;

    while (read < SCHEDULING_REMINDER_PASS_LIMIT) {
      const batch = await this.prisma.user.findMany({
        where: {
          role: UserRole.STUDENT,
          deletedAt: null,
          isSuspended: false,
          OR: [{ lastSchedulingReminderAt: null }, { lastSchedulingReminderAt: { lte: cutoff } }],
          ...(cursor ? { id: { gt: cursor } } : {}),
        },
        orderBy: { id: 'asc' },
        take: Math.min(SCHEDULING_REMINDER_BATCH_SIZE, SCHEDULING_REMINDER_PASS_LIMIT - read),
        select: { id: true },
      });
      if (batch.length === 0) break;
      read += batch.length;
      cursor = batch[batch.length - 1].id;

      for (let i = 0; i < batch.length; i += SCHEDULING_REMINDER_CONCURRENCY) {
        const chunk = batch.slice(i, i + SCHEDULING_REMINDER_CONCURRENCY);
        const results = await Promise.all(chunk.map((student) => this.remind(student.id, now)));
        sent += results.filter(Boolean).length;
        failed += results.filter((ok) => !ok).length;
      }
    }

    if (failed > 0) this.logger.warn(`Rappels de programmation : ${failed} échec(s), ${sent} envoyé(s)`);
    return sent;
  }

  // Vrai si la notification est partie. Ne lève jamais.
  private async remind(userId: string, now: Date): Promise<boolean> {
    try {
      await this.notifications.notifyUser(
        userId,
        'Programme ton repas',
        "Tu peux programmer ta commande avant de sortir : choisis ton repas et l'heure à laquelle tu le veux.",
        NotificationType.INFO,
      );
    } catch (error) {
      this.logger.error(
        `Rappel de programmation impossible user=${userId}`,
        error instanceof Error ? error.stack : error,
      );
      return false;
    }
    try {
      await this.prisma.user.update({ where: { id: userId }, data: { lastSchedulingReminderAt: now } });
    } catch (error) {
      // Rappel parti mais non mémorisé : l'étudiant sera rappelé au prochain passage.
      this.logger.error(
        `Date du rappel non enregistrée user=${userId}`,
        error instanceof Error ? error.stack : error,
      );
    }
    return true;
  }
}
