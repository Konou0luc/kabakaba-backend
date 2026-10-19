import { ForbiddenException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { NotificationType } from '@prisma/client';
import { PrismaService } from '../../../database/services/prisma.service';
import { UpdateNotificationDto } from '../dto/update-notification.dto';
import { FcmService } from './fcm.service';

interface Actor {
  id: string;
  isAdmin: boolean;
}

@Injectable()
export class NotificationsService {
  private readonly logger = new Logger(NotificationsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly fcm: FcmService,
  ) {}

  /**
   * Notification in-app + push FCM si un token d’appareil est enregistré.
   */
  async notifyUser(
    userId: string,
    title: string,
    message: string,
    type: NotificationType = NotificationType.INFO,
    push?: {
      kind?: string;
      channelId?: string;
      sound?: string;
      data?: Record<string, string>;
    },
  ) {
    const notification = await this.prisma.notification.create({
      data: { userId, title, message, type },
    });

    let fcmResult: Awaited<ReturnType<FcmService['sendToUser']>> | undefined;
    try {
      fcmResult = await this.fcm.sendToUser(userId, title, message, {
        kind: push?.kind,
        channelId: push?.channelId,
        sound: push?.sound,
        data: {
          notificationId: notification.id,
          ...(push?.data ?? {}),
        },
      });
      if (fcmResult.failureCount > 0 || fcmResult.successCount === 0) {
        this.logger.warn(
          `Push FCM partiel/absent user=${userId} ok=${fcmResult.successCount} fail=${fcmResult.failureCount} devices=${fcmResult.deviceCount} errors=${fcmResult.errors.join(',')}`,
        );
      }
    } catch (error) {
      this.logger.error(
        `Push FCM impossible user=${userId}`,
        error instanceof Error ? error.stack : error,
      );
    }

    return Object.assign(notification, { fcm: fcmResult ?? null });
  }

  async findAll(page: number = 1, limit: number = 10, userId?: string) {
    const skip = (page - 1) * limit;
    const where = {
      deletedAt: null,
      ...(userId ? { userId } : {}),
    };
    const [total, data] = await this.prisma.$transaction([
      this.prisma.notification.count({ where }),
      this.prisma.notification.findMany({
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

  async findOne(id: string, actor?: Actor) {
    const notification = await this.prisma.notification.findUnique({
      where: { id, deletedAt: null },
    });
    if (!notification) throw new NotFoundException(`Notification ${id} introuvable`);
    if (actor && !actor.isAdmin && notification.userId !== actor.id) {
      throw new ForbiddenException("Vous n'avez pas accès à cette notification");
    }
    return notification;
  }

  async update(id: string, updateNotificationDto: UpdateNotificationDto, actor?: Actor) {
    await this.findOne(id, actor);
    return this.prisma.notification.update({
      where: { id },
      data: updateNotificationDto,
    });
  }

}
