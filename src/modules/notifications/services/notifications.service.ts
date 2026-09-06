import { ForbiddenException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { NotificationType } from '@prisma/client';
import { PrismaService } from '../../../database/services/prisma.service';
import { CreateNotificationDto } from '../dto/create-notification.dto';
import { UpdateNotificationDto } from '../dto/update-notification.dto';

interface Actor {
  id: string;
  isAdmin: boolean;
}

@Injectable()
export class NotificationsService {
  private readonly logger = new Logger(NotificationsService.name);

  constructor(private readonly prisma: PrismaService) {}

  async create(createNotificationDto: CreateNotificationDto) {
    return this.prisma.notification.create({
      data: createNotificationDto,
    });
  }

  /**
   * Notification in-app + intention push (tokens via POST /devices).
   * L’envoi FCM/APNs se branche ici dès que les credentials cloud sont prêts.
   */
  async notifyUser(
    userId: string,
    title: string,
    message: string,
    type: NotificationType = NotificationType.INFO,
  ) {
    const notification = await this.prisma.notification.create({
      data: { userId, title, message, type },
    });

    const devices = await this.prisma.device.findMany({
      where: { userId, deletedAt: null },
      select: { deviceToken: true, platform: true },
    });

    if (devices.length > 0) {
      this.logger.log(
        `Push pending user=${userId} devices=${devices.length} [${devices.map((d) => d.platform).join(',')}]`,
      );
    }

    return notification;
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

  async remove(id: string) {
    await this.findOne(id);
    return this.prisma.notification.update({
      where: { id },
      data: { deletedAt: new Date() },
    });
  }
}
