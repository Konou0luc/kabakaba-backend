import { BadRequestException, HttpException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { NotificationType, Prisma, ScheduledOrderStatus, VendorCapacity } from '@prisma/client';
import { PrismaService } from '../../../database/services/prisma.service';
import { NotificationsService } from '../../notifications/services/notifications.service';
import { OrdersService } from '../../orders/services/orders.service';
import { CreateOrderDto } from '../../orders/dto/create-order.dto';
import { assertConsumptionShape, assertItemsShape } from '../../orders/order-form';
import { assertOrderArticles } from '../../orders/order-articles';
import { CreateScheduledOrderDto } from '../dto/create-scheduled-order.dto';
import {
  EXECUTION_BATCH_SIZE,
  MAX_PENDING_SCHEDULED_ORDERS_PER_STUDENT,
  SCHEDULE_MAX_LEAD_HOURS,
  SCHEDULE_MIN_LEAD_MINUTES,
} from '../scheduled-orders.constants';

// Ce que voit l'étudiant : la cantine et, une fois la commande passée, son numéro.
const SCHEDULED_ORDER_INCLUDE = {
  vendor: { select: { id: true, canteenName: true } },
  order: { select: { id: true, orderNumber: true, status: true } },
} as const;

// Motif enregistré quand l'échec n'est pas un refus métier (panne, contrainte de base).
const TECHNICAL_FAILURE_REASON = "Erreur technique : la commande n'a pas pu être passée";

type ScheduledOrderRow = Prisma.ScheduledOrderGetPayload<object>;
type ExecutionOutcome = 'placed' | 'failed' | 'skipped';

@Injectable()
export class ScheduledOrdersService {
  private readonly logger = new Logger(ScheduledOrdersService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly orders: OrdersService,
    private readonly notifications: NotificationsService,
  ) {}

  /**
   * Programmation (CDC 29) : on valide la FORME de la commande, la fenêtre horaire, la
   * cantine, l'existence et l'appartenance des articles, et le plafond d'attente. Le stock,
   * la disponibilité, le prix, le solde et le numéro ne sont PAS vérifiés ici : rien n'est
   * débité ni réservé avant l'heure prévue.
   */
  async create(dto: CreateScheduledOrderDto, studentId: string) {
    assertItemsShape(dto.items);
    assertConsumptionShape(dto.consumptionMode, dto.takeawayOptionId);

    const scheduledFor = new Date(dto.scheduledFor);
    const now = Date.now();
    if (scheduledFor.getTime() < now + SCHEDULE_MIN_LEAD_MINUTES * 60_000) {
      throw new BadRequestException(
        `L'heure prévue doit être au moins ${SCHEDULE_MIN_LEAD_MINUTES} minutes dans le futur`,
      );
    }
    if (scheduledFor.getTime() > now + SCHEDULE_MAX_LEAD_HOURS * 3_600_000) {
      throw new BadRequestException(
        `L'heure prévue doit être au plus ${SCHEDULE_MAX_LEAD_HOURS} heures dans le futur`,
      );
    }

    // CDC 24 : OPEN et BUSY acceptent la programmation, CLOSED refuse tout.
    const vendor = await this.prisma.vendor.findUnique({
      where: { id: dto.vendorId, deletedAt: null },
      select: { isActive: true, capacityStatus: true },
    });
    if (!vendor) throw new NotFoundException('Vendeur introuvable');
    if (!vendor.isActive) {
      throw new BadRequestException("Cette cantine n'accepte pas de commandes actuellement");
    }
    if (vendor.capacityStatus === VendorCapacity.CLOSED) {
      throw new BadRequestException('Ce vendeur est fermé pour le moment');
    }

    // Existence et appartenance des menus, composants et de l'option d'emporté, avec les
    // mêmes règles et messages que la création d'une commande. Le stock, la disponibilité,
    // le prix et le solde ne sont PAS contrôlés ici : seulement à l'heure prévue.
    await assertOrderArticles(this.prisma, {
      vendorId: dto.vendorId,
      items: dto.items,
      consumptionMode: dto.consumptionMode,
      takeawayOptionId: dto.takeawayOptionId,
    });

    return this.prisma.$transaction(async (tx) => {
      // Verrou de ligne sur l'étudiant : deux programmations simultanées se suivent, la
      // seconde compte donc la première et le plafond ne peut pas être dépassé.
      await tx.$queryRaw`SELECT id FROM "User" WHERE id = ${studentId} FOR UPDATE`;
      const pending = await tx.scheduledOrder.count({
        where: { studentId, status: ScheduledOrderStatus.PENDING },
      });
      if (pending >= MAX_PENDING_SCHEDULED_ORDERS_PER_STUDENT) {
        throw new BadRequestException(
          `Vous avez déjà ${MAX_PENDING_SCHEDULED_ORDERS_PER_STUDENT} commandes programmées en attente`,
        );
      }

      return tx.scheduledOrder.create({
        data: {
          studentId,
          vendorId: dto.vendorId,
          scheduledFor,
          consumptionMode: dto.consumptionMode,
          takeawayOptionId: dto.takeawayOptionId ?? null,
          items: dto.items.map((item) => ({
            ...(item.menuId ? { menuId: item.menuId } : {}),
            ...(item.componentId ? { componentId: item.componentId } : {}),
            quantity: item.quantity,
          })),
        },
        include: SCHEDULED_ORDER_INCLUDE,
      });
    });
  }

  // Les commandes programmées de l'étudiant connecté, jamais celles des autres.
  // En attente : la plus proche d'abord ; sinon (toutes, ou autre statut) : la plus récente d'abord.
  async findAll(studentId: string, page: number = 1, limit: number = 10, status?: ScheduledOrderStatus) {
    const skip = (page - 1) * limit;
    const where = { studentId, ...(status ? { status } : {}) };
    const orderBy = { scheduledFor: status === ScheduledOrderStatus.PENDING ? ('asc' as const) : ('desc' as const) };
    const [total, data] = await this.prisma.$transaction([
      this.prisma.scheduledOrder.count({ where }),
      this.prisma.scheduledOrder.findMany({ where, skip, take: limit, orderBy, include: SCHEDULED_ORDER_INCLUDE }),
    ]);
    return { data, meta: { page, limit, total, totalPages: Math.ceil(total / limit) } };
  }

  // 404 aussi pour la commande d'un autre étudiant : on ne révèle pas son existence.
  async findOne(id: string, studentId: string) {
    const scheduledOrder = await this.prisma.scheduledOrder.findFirst({
      where: { id, studentId },
      include: SCHEDULED_ORDER_INCLUDE,
    });
    if (!scheduledOrder) throw new NotFoundException('Commande programmée introuvable');
    return scheduledOrder;
  }

  /**
   * Annulation par l'étudiant, tant que la commande est en attente, sans motif (aucun
   * ticket n'a bougé). La mise à jour est conditionnelle sur PENDING : face à l'exécution
   * qui réclame la même ligne, une seule des deux l'emporte.
   */
  async cancel(id: string, studentId: string) {
    const cancelled = await this.prisma.scheduledOrder.updateMany({
      where: { id, studentId, status: ScheduledOrderStatus.PENDING },
      data: { status: ScheduledOrderStatus.CANCELLED, cancelledAt: new Date() },
    });
    if (cancelled.count === 0) {
      // Introuvable (ou à un autre étudiant) : 404 ; sinon elle n'est plus en attente.
      await this.findOne(id, studentId);
      throw new BadRequestException(
        "Seule une commande programmée en attente peut être annulée. Une commande déjà passée suit les règles d'annulation des commandes.",
      );
    }
    return this.findOne(id, studentId);
  }

  /**
   * Exécution (cron) : traite au plus EXECUTION_BATCH_SIZE commandes programmées dont
   * l'heure est arrivée, de la plus ancienne à la plus récente.
   */
  async executeDue(): Promise<{ placed: number; failed: number }> {
    const due = await this.prisma.scheduledOrder.findMany({
      where: { status: ScheduledOrderStatus.PENDING, scheduledFor: { lte: new Date() } },
      orderBy: { scheduledFor: 'asc' },
      take: EXECUTION_BATCH_SIZE,
    });

    let placed = 0;
    let failed = 0;
    for (const scheduledOrder of due) {
      try {
        const outcome = await this.executeOne(scheduledOrder);
        if (outcome === 'placed') placed += 1;
        if (outcome === 'failed') failed += 1;
      } catch (error) {
        // Ligne laissée PENDING (ex. base injoignable) : elle sera reprise au prochain passage.
        this.logger.error(
          `Exécution impossible scheduledOrder=${scheduledOrder.id}`,
          error instanceof Error ? error.stack : error,
        );
      }
    }
    return { placed, failed };
  }

  private async executeOne(scheduledOrder: ScheduledOrderRow): Promise<ExecutionOutcome> {
    let created: Awaited<ReturnType<OrdersService['createWithinTransaction']>> | null;
    try {
      // Une seule transaction : réclamer la ligne, créer la commande, lier les deux.
      created = await this.prisma.$transaction(async (tx) => {
        // Réclamation par mise à jour conditionnelle sur PENDING. Une exécution simultanée
        // de la même ligne attend ici la fin de la première puis trouve count = 0 : une
        // seule commande est créée. Si la création échoue, tout est annulé, ligne comprise.
        const claimed = await tx.scheduledOrder.updateMany({
          where: { id: scheduledOrder.id, status: ScheduledOrderStatus.PENDING },
          data: { status: ScheduledOrderStatus.PLACED, processedAt: new Date() },
        });
        if (claimed.count === 0) return null;

        // Même logique que POST /orders, avec une seule différence : BUSY est accepté.
        const result = await this.orders.createWithinTransaction(
          tx,
          this.toCreateOrderDto(scheduledOrder),
          scheduledOrder.studentId,
          { acceptBusy: true },
        );
        await tx.scheduledOrder.update({ where: { id: scheduledOrder.id }, data: { orderId: result.order.id } });
        return result;
      });
    } catch (error) {
      return this.markFailed(scheduledOrder, error);
    }

    if (!created) return 'skipped';
    // Après le commit, sans jamais bloquer : « confirmée » (étudiant), nouvelle commande et stock faible (vendeuse).
    await this.orders.notifyOrderConfirmed(scheduledOrder.studentId, scheduledOrder.vendorId);
    await this.orders.notifyVendorAfterCreation(created);
    return 'placed';
  }

  // Reconstitue la commande demandée à partir de la ligne enregistrée.
  private toCreateOrderDto(scheduledOrder: ScheduledOrderRow): CreateOrderDto {
    if (!Array.isArray(scheduledOrder.items)) {
      throw new BadRequestException('Contenu de la commande programmée invalide');
    }
    const items = (scheduledOrder.items as { menuId?: string; componentId?: string; quantity: number }[]).map(
      (item) => ({ menuId: item.menuId, componentId: item.componentId, quantity: item.quantity }),
    );
    assertItemsShape(items);
    return {
      vendorId: scheduledOrder.vendorId,
      items,
      consumptionMode: scheduledOrder.consumptionMode,
      takeawayOptionId: scheduledOrder.takeawayOptionId ?? undefined,
    };
  }

  /**
   * Appelée HORS de la transaction annulée : la commande n'a rien écrit (ni débit, ni
   * stock, ni numéro). Marque FAILED seulement si la ligne est encore PENDING ; ne notifie
   * que si c'est bien cet appel qui l'a marquée.
   */
  private async markFailed(scheduledOrder: ScheduledOrderRow, error: unknown): Promise<ExecutionOutcome> {
    let reason = TECHNICAL_FAILURE_REASON;
    if (error instanceof HttpException) {
      reason = error.message;
    } else {
      this.logger.error(
        `Échec technique scheduledOrder=${scheduledOrder.id}`,
        error instanceof Error ? error.stack : error,
      );
    }

    const marked = await this.prisma.scheduledOrder.updateMany({
      where: { id: scheduledOrder.id, status: ScheduledOrderStatus.PENDING },
      data: { status: ScheduledOrderStatus.FAILED, failureReason: reason, processedAt: new Date() },
    });
    if (marked.count === 0) return 'skipped';

    await this.notifyFailure(scheduledOrder, reason);
    return 'failed';
  }

  // La notification ne bloque jamais le traitement.
  private async notifyFailure(scheduledOrder: ScheduledOrderRow, reason: string) {
    try {
      const vendor = await this.prisma.vendor.findUnique({
        where: { id: scheduledOrder.vendorId },
        select: { canteenName: true },
      });
      const place = vendor?.canteenName?.trim() || 'ta cantine';
      await this.notifications.notifyUser(
        scheduledOrder.studentId,
        'Commande programmée non passée',
        `Ta commande programmée chez ${place} n'a pas pu être passée (${reason}). Aucun ticket n'a été débité.`,
        NotificationType.WARNING,
      );
    } catch (error) {
      this.logger.error(
        `Notif échec commande programmée impossible student=${scheduledOrder.studentId}`,
        error instanceof Error ? error.stack : error,
      );
    }
  }
}
