import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../../database/services/prisma.service';
import { CreateNotificationDto } from '../dto/create-notification.dto';
import { UpdateNotificationDto } from '../dto/update-notification.dto';

interface Actor {
  id: string;
  isAdmin: boolean;
}

@Injectable()
export class NotificationsService {
  constructor(private readonly prisma: PrismaService) {}

  async create(createNotificationDto: CreateNotificationDto) {
    return this.prisma.notification.create({
      data: createNotificationDto,
    });
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

    if (!notification) throw new NotFoundException(`Notification avec l'identifiant ${id} introuvable`);

    // SÉCURITÉ : un utilisateur non-admin ne peut consulter/modifier que
    // SES propres notifications.
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
