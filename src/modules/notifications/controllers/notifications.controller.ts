import {
  Controller,
  Get,
  Body,
  Patch,
  Param,
  Post,
  Query,
  UseGuards,
  Request,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiQuery,
} from '@nestjs/swagger';
import { NotificationsService } from '../services/notifications.service';
import { FcmService } from '../services/fcm.service';
import { UpdateNotificationDto } from '../dto/update-notification.dto';
import { NotificationEntity } from '../entities/notification.entity';
import { PaginationDto } from '../../../common/dto/pagination.dto';
import { Roles } from '../../../common/decorators/roles.decorator';
import { WebRoles } from '../../../common/decorators/web-roles.decorator';
import { NotificationType, UserRole, WebUserRole } from '@prisma/client';
import { CombinedJwtAuthGuard } from '../../../common/guards/combined-jwt-auth.guard';
import { CombinedRolesGuard } from '../../../common/guards/combined-roles.guard';
import { PrismaService } from '../../../database/services/prisma.service';

@ApiTags('Notifications')
@Controller('notifications')
export class NotificationsController {
  constructor(
    private readonly notificationsService: NotificationsService,
    private readonly fcm: FcmService,
    private readonly prisma: PrismaService,
  ) {}

  @Post('welcome')
  @ApiBearerAuth()
  @UseGuards(CombinedJwtAuthGuard, CombinedRolesGuard)
  @Roles(UserRole.STUDENT, UserRole.VENDOR)
  @WebRoles()
  @ApiOperation({
    summary:
      'Bienvenue push (à appeler après enregistrement du device, juste après login)',
  })
  async welcome(@Request() req: any) {
    const userId = req.user.id as string;
    const role = req.user.role as UserRole;
    const devices = await this.prisma.device.count({
      where: { userId, deletedAt: null },
    });
    let body = 'Content de te revoir. Bon appétit sur le campus !';
    if (role === UserRole.VENDOR) {
      const vendor = await this.prisma.vendor.findFirst({
        where: { userId, deletedAt: null },
        select: { canteenName: true },
      });
      const place = vendor?.canteenName?.trim();
      body = place
        ? `Bonjour ${place} — les alertes de commandes sont actives.`
        : 'Bonjour — les alertes de commandes sont actives.';
    }
    const notification = await this.notificationsService.notifyUser(
      userId,
      'Bienvenue sur kabakaba',
      body,
      NotificationType.INFO,
      {
        kind: 'WELCOME',
        channelId:
          role === UserRole.VENDOR ? 'kabakaba_orders' : 'kabakaba_default',
      },
    );
    return {
      ok: true,
      notificationId: notification.id,
      devicesRegistered: devices,
      hint:
        devices === 0
          ? 'Aucun device enregistré — active les notifications push dans Profil.'
          : 'Bienvenue envoyée.',
    };
  }

  @Post('test-push')
  @ApiBearerAuth()
  @UseGuards(CombinedJwtAuthGuard, CombinedRolesGuard)
  @Roles(UserRole.STUDENT, UserRole.VENDOR)
  @WebRoles()
  @ApiOperation({
    summary:
      'Envoie une notification de test (in-app + FCM) au compte connecté',
  })
  async testPush(@Request() req: any) {
    const userId = req.user.id as string;
    const devices = await this.prisma.device.count({
      where: { userId, deletedAt: null },
    });
    const fcm = this.fcm.status();
    const notification = await this.notificationsService.notifyUser(
      userId,
      'Test kabakaba',
      'Si tu vois ceci, le push est branché.',
      NotificationType.INFO,
      {
        kind: 'PUSH_TEST',
        channelId: 'kabakaba_orders',
        sound: 'order_ring',
      },
    );
    return {
      ok: true,
      notificationId: notification.id,
      devicesRegistered: devices,
      fcm,
      hint:
        devices === 0
          ? 'Aucun deviceToken en base pour ce compte — ouvre l’app, accepte les notifs, puis rappelle GET /devices.'
          : !fcm.ready
            ? 'FCM inactif côté serveur — vérifie FIREBASE_SERVICE_ACCOUNT_JSON sur Vercel.'
            : 'Push envoyé. Vérifie la notif sur l’appareil.',
    };
  }

  @Get()
  @ApiBearerAuth()
  @UseGuards(CombinedJwtAuthGuard, CombinedRolesGuard)
  @Roles(UserRole.ADMIN, UserRole.STUDENT, UserRole.VENDOR)
  @WebRoles(WebUserRole.ADMIN)
  @ApiOperation({ summary: 'Récupérer toutes les notifications actives' })
  @ApiQuery({ type: PaginationDto })
  @ApiResponse({
    status: 200,
    description: 'Retourne toutes les notifications actives avec pagination.',
  })
  findAll(@Query() paginationDto: PaginationDto, @Request() req) {
    const isWebAdmin =
      req.user.__authKind === 'web' && req.user.role === WebUserRole.ADMIN;
    return this.notificationsService.findAll(
      paginationDto.page,
      paginationDto.limit,
      isWebAdmin ? undefined : req.user.id,
    );
  }

  @Get(':id')
  @ApiBearerAuth()
  @UseGuards(CombinedJwtAuthGuard, CombinedRolesGuard)
  @Roles(UserRole.ADMIN, UserRole.STUDENT, UserRole.VENDOR)
  @WebRoles(WebUserRole.ADMIN)
  @ApiOperation({ summary: 'Récupérer une notification active' })
  @ApiResponse({ status: 200, description: 'Retourne la notification.', type: NotificationEntity })
  @ApiResponse({ status: 404, description: 'Notification introuvable.' })
  findOne(@Param('id') id: string, @Request() req) {
    const isAdmin =
      req.user.__authKind === 'web' && req.user.role === WebUserRole.ADMIN;
    return this.notificationsService.findOne(id, { id: req.user.id, isAdmin });
  }

  @Patch(':id')
  @ApiBearerAuth()
  @UseGuards(CombinedJwtAuthGuard, CombinedRolesGuard)
  @Roles(UserRole.ADMIN, UserRole.STUDENT, UserRole.VENDOR)
  @WebRoles(WebUserRole.ADMIN)
  @ApiOperation({ summary: 'Mettre à jour une notification (Admin ou propriétaire seulement)' })
  @ApiResponse({
    status: 200,
    description: 'La notification a été mise à jour avec succès.',
    type: NotificationEntity,
  })
  update(@Param('id') id: string, @Body() updateNotificationDto: UpdateNotificationDto, @Request() req) {
    const isAdmin =
      req.user.__authKind === 'web' && req.user.role === WebUserRole.ADMIN;
    return this.notificationsService.update(id, updateNotificationDto, { id: req.user.id, isAdmin });
  }

}
