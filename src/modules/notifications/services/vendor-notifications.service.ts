import { Injectable, Logger } from '@nestjs/common';
import { ConsumptionMode, NotificationType } from '@prisma/client';
import { PrismaService } from '../../../database/services/prisma.service';
import { LowStockAlert } from '../low-stock';
import { NotificationsService } from './notifications.service';

/**
 * Notifications à la vendeuse (CDC 41) : nouvelle commande et stock faible. Appelées APRÈS le
 * commit de l'opération métier ; un échec est journalisé et n'est jamais propagé.
 */
@Injectable()
export class VendorNotificationsService {
  private readonly logger = new Logger(VendorNotificationsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService,
  ) {}

  async notifyNewOrder(vendorId: string, orderNumber: string, consumptionMode: ConsumptionMode) {
    try {
      const userId = await this.vendorUserId(vendorId);
      if (!userId) return;
      const mode = consumptionMode === ConsumptionMode.TAKEAWAY ? 'à emporter' : 'sur place';
      await this.notifications.notifyUser(
        userId,
        'Nouvelle commande',
        `Commande ${orderNumber} (${mode}).`,
        NotificationType.INFO,
      );
    } catch (error) {
      this.logger.error(
        `Notif nouvelle commande impossible vendor=${vendorId} commande=${orderNumber}`,
        error instanceof Error ? error.stack : error,
      );
    }
  }

  // Une notification par composant ; l'échec de l'une n'empêche pas les suivantes.
  async notifyLowStock(alerts: LowStockAlert[]) {
    const userIdByVendor = new Map<string, string | null>();
    for (const alert of alerts) {
      try {
        if (!userIdByVendor.has(alert.vendorId)) {
          userIdByVendor.set(alert.vendorId, await this.vendorUserId(alert.vendorId));
        }
        const userId = userIdByVendor.get(alert.vendorId);
        if (!userId) continue;
        await this.notifications.notifyUser(
          userId,
          'Stock faible',
          `${alert.name} : il ne reste que ${alert.remaining} en stock.`,
          NotificationType.WARNING,
        );
      } catch (error) {
        this.logger.error(
          `Notif stock faible impossible vendor=${alert.vendorId} composant=${alert.componentId}`,
          error instanceof Error ? error.stack : error,
        );
      }
    }
  }

  // Utilisateur lié à la cantine (Vendor.userId).
  private async vendorUserId(vendorId: string): Promise<string | null> {
    const vendor = await this.prisma.vendor.findUnique({ where: { id: vendorId }, select: { userId: true } });
    return vendor?.userId ?? null;
  }
}
