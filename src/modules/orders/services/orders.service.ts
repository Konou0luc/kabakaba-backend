import { BadRequestException, ConflictException, ForbiddenException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { OrderStatus, OrderCancelledBy, UserRole, NotificationType, ConsumptionMode, VendorCapacity, Prisma } from '@prisma/client';
import * as crypto from 'crypto';
import { PrismaService } from '../../../database/services/prisma.service';
import { CreateOrderDto } from '../dto/create-order.dto';
import { UpdateOrderDto } from '../dto/update-order.dto';
import { CancelOrderDto } from '../dto/cancel-order.dto';
import { NotificationsService } from '../../notifications/services/notifications.service';
import { ORDER_NUMBERS, pickOrderNumber } from '../order-number';
import { assertConsumptionShape, assertItemsShape } from '../order-form';
import { menuPriceTickets, menuUnavailableComponents } from '../../menus/menu-pricing';

interface Actor {
  id: string;
  role?: UserRole;
  isAdmin: boolean;
  // 'web' = session admin dashboard (WebUser, pas de ligne User associée) ;
  // 'mobile' ou absent = compte User réel (étudiant/vendeur).
  // Distingue les deux car OrderStatusHistory.changedById référence User,
  // jamais WebUser : y stocker un id de WebUser violerait la contrainte FK.
  authKind?: 'mobile' | 'web';
}

// Lignes de commande renvoyées par create, findAll et findOne : nom, quantité et prix
// unitaire figés, plus les composants (nom et unité) que la vendeuse doit préparer.
const ORDER_ITEMS_INCLUDE = {
  components: { include: { component: { select: { name: true, unit: true } } } },
} as const;

// Même logique que resolveRange() dans analytics.service.ts : bornes
// incluses, `to` étendu à la fin de journée pour couvrir toute la
// journée choisie dans le sélecteur de plage du frontend.
function dateFilter(from?: string, to?: string) {
  if (!from && !to) return undefined;
  const until = to ? new Date(to) : new Date();
  until.setHours(23, 59, 59, 999);
  return { ...(from ? { gte: new Date(from) } : {}), lte: until };
}

@Injectable()
export class OrdersService {
  private readonly logger = new Logger(OrdersService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService,
  ) {}

  /**
   * Un STUDENT ne peut accéder qu'à ses propres commandes, un VENDOR qu'aux
   * commandes de sa cantine. ADMIN passent sans restriction.
   *
   * order.vendorId référence Vendor.id, distinct de User.id (actor.id) :
   * on doit résoudre le profil Vendor du User connecté avant de comparer.
   */
  private async assertOwnership(
    order: { studentId: string; vendorId: string },
    actor: Actor,
  ) {
    if (actor.isAdmin) return;

    if (actor.role === UserRole.STUDENT && order.studentId === actor.id) {
      return;
    }

    if (actor.role === UserRole.VENDOR) {
      const vendor = await this.prisma.vendor.findUnique({ where: { userId: actor.id } });
      if (vendor && order.vendorId === vendor.id) return;
    }

    throw new ForbiddenException("Vous n'avez pas accès à cette commande");
  }

  /**
   * Création normale (POST /orders) : seule une cantine « Ouverte » reçoit des commandes.
   */
  async create(createOrderDto: CreateOrderDto, studentId: string) {
    // Forme des lignes (sans accès à la base).
    assertItemsShape(createOrderDto.items);

    const order = await this.prisma.$transaction((tx) =>
      this.createWithinTransaction(tx, createOrderDto, studentId, { acceptBusy: false }),
    );

    await this.notifyStudentOrderStatus(studentId, OrderStatus.CONFIRMED, createOrderDto.vendorId);
    return order;
  }

  /**
   * Notification « commande confirmée » après une création faite hors de `create`
   * (commande programmée exécutée). Ne lève jamais : une notification manquée ne doit
   * pas défaire une commande déjà passée.
   */
  async notifyOrderConfirmed(studentId: string, vendorId: string) {
    try {
      await this.notifyStudentOrderStatus(studentId, OrderStatus.CONFIRMED, vendorId);
    } catch (error) {
      this.logger.error(
        `Notif commande confirmée impossible student=${studentId}`,
        error instanceof Error ? error.stack : error,
      );
    }
  }

  /**
   * Logique de création d'une commande dans une transaction FOURNIE : vérifications,
   * prix calculé côté serveur, numéro, déduction atomique du stock, débit du
   * portefeuille, ligne de transaction. Si une étape échoue, l'appelant annule la
   * transaction et rien n'est écrit.
   *
   * `acceptBusy` : une cantine « Occupée » (BUSY) est acceptée. Faux pour la création
   * immédiate ; vrai pour l'exécution d'une commande programmée (CDC 24 : les commandes
   * programmées restent honorées quand la vendeuse est occupée). Une cantine « Fermée »
   * refuse dans tous les cas.
   *
   * Ne notifie pas : la notification est faite par l'appelant, après le commit.
   */
  async createWithinTransaction(
    tx: Prisma.TransactionClient,
    createOrderDto: CreateOrderDto,
    studentId: string,
    options: { acceptBusy: boolean },
  ) {
    const { vendorId, items, consumptionMode, takeawayOptionId } = createOrderDto;

    const vendor = await tx.vendor.findUnique({ where: { id: vendorId, deletedAt: null } });
    if (!vendor) throw new NotFoundException('Vendeur introuvable');
    if (!vendor.isActive) {
      throw new BadRequestException("Cette cantine n'accepte pas de commandes actuellement");
    }
    // CDC 24 : statut de capacité choisi par la vendeuse, contrôlé ici même si le
    // mobile a un affichage périmé. Création immédiate : seule une cantine « Ouverte »
    // reçoit des commandes. Exécution d'une commande programmée (acceptBusy) :
    // « Occupée » est aussi acceptée. « Fermée » refuse toujours.
    const capacityAccepted =
      vendor.capacityStatus === VendorCapacity.OPEN ||
      (options.acceptBusy && vendor.capacityStatus === VendorCapacity.BUSY);
    if (!capacityAccepted) {
      throw new BadRequestException(
        vendor.capacityStatus === VendorCapacity.BUSY
          ? 'Ce vendeur est momentanément indisponible'
          : 'Ce vendeur est fermé pour le moment',
      );
    }

    // Menus pré-composés et composants libres de la commande, chargés en une fois.
    // Le prix vient UNIQUEMENT de la base (prix des composants), jamais du client.
    const menuIds = items.flatMap((i) => (i.menuId ? [i.menuId] : []));
    const componentIds = items.flatMap((i) => (i.componentId ? [i.componentId] : []));
    const menus = menuIds.length
      ? await tx.menu.findMany({
          where: { id: { in: menuIds }, deletedAt: null },
          include: { lines: { include: { component: true } } },
        })
      : [];
    const freeComponents = componentIds.length
      ? await tx.component.findMany({ where: { id: { in: componentIds }, deletedAt: null } })
      : [];
    const menuById = new Map(menus.map((m) => [m.id, m]));
    const componentById = new Map(freeComponents.map((c) => [c.id, c]));

    // « Poulet indisponible » / « Poulet, Riz indisponibles » : jamais la quantité en stock.
    const unavailable = (names: string[]) =>
      names.length > 1 ? `${names.join(', ')} indisponibles` : `${names[0]} indisponible`;

    let totalTickets = 0;
    const orderItemsData: {
      menuId?: string;
      componentId?: string;
      name: string;
      quantity: number;
      unitPrice: number;
      components: { componentId: string; quantity: number }[];
    }[] = [];
    // Unités nécessaires par composant sur TOUTE la commande (un composant peut
    // apparaître dans plusieurs menus et en libre) et nom de chacun, pour le
    // message d'erreur de la déduction.
    const neededByComponent = new Map<string, number>();
    const nameByComponent = new Map<string, string>();
    const need = (componentId: string, name: string, units: number) => {
      neededByComponent.set(componentId, (neededByComponent.get(componentId) ?? 0) + units);
      nameByComponent.set(componentId, name);
    };

    for (const requestedItem of items) {
      if (requestedItem.menuId) {
        const menu = menuById.get(requestedItem.menuId);
        if (!menu) throw new NotFoundException(`Menu ${requestedItem.menuId} introuvable`);
        if (menu.vendorId !== vendorId) {
          throw new BadRequestException(`Le menu "${menu.name}" n'appartient pas à ce vendeur`);
        }
        if (!menu.isActive) {
          throw new BadRequestException(`Menu "${menu.name}" indisponible`);
        }
        const missing = menuUnavailableComponents(menu.lines);
        if (missing.length > 0) {
          throw new BadRequestException(
            `Menu "${menu.name}" indisponible : ${unavailable(missing.map((c) => c.name))}`,
          );
        }

        for (const line of menu.lines) {
          need(line.component.id, line.component.name, line.quantity * requestedItem.quantity);
        }
        const unitPrice = menuPriceTickets(menu.lines);
        totalTickets += unitPrice * requestedItem.quantity;
        orderItemsData.push({
          menuId: menu.id,
          name: menu.name,
          quantity: requestedItem.quantity,
          unitPrice,
          components: menu.lines.map((line) => ({
            componentId: line.component.id,
            quantity: line.quantity * requestedItem.quantity,
          })),
        });
      } else {
        const component = componentById.get(requestedItem.componentId!);
        if (!component) throw new NotFoundException(`Composant ${requestedItem.componentId} introuvable`);
        if (component.vendorId !== vendorId) {
          throw new BadRequestException(`Le composant "${component.name}" n'appartient pas à ce vendeur`);
        }
        if (!component.isAvailable || component.quantity <= 0) {
          throw new BadRequestException(`Composant "${component.name}" indisponible`);
        }

        need(component.id, component.name, requestedItem.quantity);
        totalTickets += component.priceTickets * requestedItem.quantity;
        orderItemsData.push({
          componentId: component.id,
          name: component.name,
          quantity: requestedItem.quantity,
          unitPrice: component.priceTickets,
          components: [{ componentId: component.id, quantity: requestedItem.quantity }],
        });
      }
    }

    // Mode de consommation. Sur place : aucune option admise. À emporter :
    // l'option doit appartenir à la cantine de la commande, être active et
    // non supprimée ; son prix est ajouté UNE SEULE fois au total et figé
    // dans takeawayFeeTickets (l'historique ne bouge pas si la vendeuse
    // modifie ensuite son tarif).
    let takeawayFeeTickets = 0;
    let takeawayOptionIdToSave: string | null = null;
    assertConsumptionShape(consumptionMode, takeawayOptionId);
    if (consumptionMode === ConsumptionMode.TAKEAWAY) {
      const takeawayOption = await tx.takeawayOption.findFirst({
        where: { id: takeawayOptionId!, vendorId, isActive: true, deletedAt: null },
      });
      if (!takeawayOption) {
        throw new NotFoundException("Option d'emporté introuvable ou indisponible pour cette cantine");
      }
      takeawayFeeTickets = takeawayOption.priceTickets;
      takeawayOptionIdToSave = takeawayOption.id;
    }
    totalTickets += takeawayFeeTickets;

    // Numéro de commande propre à la cantine (CDC 25). Le verrou de ligne sur
    // la cantine sérialise les créations d'une même cantine : la seconde
    // attend le commit de la première, puis lit les numéros déjà pris. La
    // contrainte unique (vendorId, activeOrderNumber) reste le filet de la
    // base. Placé avant le débit : si les numéros sont épuisés, rien n'est écrit.
    await tx.$queryRaw`SELECT id FROM "Vendor" WHERE id = ${vendorId} FOR UPDATE`;
    const activeOrders = await tx.order.findMany({
      where: { vendorId, activeOrderNumber: { not: null } },
      select: { activeOrderNumber: true },
    });
    const orderNumber = pickOrderNumber(activeOrders.map((o) => o.activeOrderNumber!));
    if (!orderNumber) {
      throw new ConflictException(
        `Cette cantine a atteint le nombre maximum de commandes en cours (${ORDER_NUMBERS.length}). Réessayez dans quelques instants.`,
      );
    }

    // Déduction atomique du stock (CDC 10, 11 et 21), sur les quantités agrégées
    // par composant. La condition `quantity >= needed` est dans le where de
    // l'écriture elle-même : deux commandes simultanées ne peuvent pas se
    // partager le même stock, la seconde trouve count = 0 et échoue, sans lire
    // de quantité ni la divulguer. Tout est dans la transaction : un échec ici,
    // ou plus bas (solde, numéro), annule aussi les déductions déjà faites.
    // Les composants sont traités par `id` croissant : la même fin que
    // l'annulation, donc deux transactions qui touchent les mêmes composants
    // les verrouillent dans le même ordre et ne peuvent pas se bloquer.
    // Placée après le verrou de la cantine et le choix du numéro : une seule
    // création à la fois par cantine décide du stock, et un refus de numéro ne
    // touche à rien ; placée avant le débit : un stock insuffisant, le refus le
    // plus courant, est constaté avant toute écriture sur le portefeuille, et les
    // verrous sont pris dans le même ordre que l'annulation (composants puis
    // portefeuille). La disponibilité d'un composant reste calculée : on
    // n'écrit jamais isAvailable.
    for (const [componentId, needed] of [...neededByComponent].sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))) {
      const deducted = await tx.component.updateMany({
        where: { id: componentId, deletedAt: null, isAvailable: true, quantity: { gte: needed } },
        data: { quantity: { decrement: needed } },
      });
      if (deducted.count === 0) {
        throw new BadRequestException(`${nameByComponent.get(componentId)!} insuffisant`);
      }
    }

    // Paiement : tickets = FCFA, conversion 1:1, aucune commission sur les
    // commandes. Débit conditionnel atomique : la clause
    // walletBalance >= totalTickets dans le where empêche toute commande
    // au-delà du solde disponible, y compris en cas de requêtes concurrentes.
    // La commande naît directement CONFIRMED (statut par défaut du schéma).
    const debited = await tx.user.updateMany({
      where: { id: studentId, walletBalance: { gte: totalTickets } },
      data: { walletBalance: { decrement: totalTickets } },
    });
    if (debited.count === 0) {
      throw new BadRequestException('Solde insuffisant pour cette commande');
    }

    const order = await tx.order.create({
      data: {
        studentId,
        vendorId,
        orderNumber,
        activeOrderNumber: orderNumber,
        totalTickets,
        consumptionMode,
        takeawayOptionId: takeawayOptionIdToSave,
        takeawayFeeTickets,
        items: {
          create: orderItemsData.map((item) => ({
            menuId: item.menuId,
            componentId: item.componentId,
            name: item.name,
            quantity: item.quantity,
            unitPrice: item.unitPrice,
            components: { create: item.components },
          })),
        },
      },
      include: { items: { include: ORDER_ITEMS_INCLUDE } },
    });

    await tx.transaction.create({
      data: {
        userId: studentId,
        type: 'PAYMENT',
        status: 'COMPLETED',
        amount: totalTickets,
        reference: crypto.randomUUID(),
        description: `Paiement de la commande ${order.id}`,
        relatedOrderId: order.id,
      },
    });

    return order;
  }

  async findAll(
    page: number = 1,
    limit: number = 10,
    studentId?: string,
    vendorId?: string,
    status?: OrderStatus,
    vendorUserId?: string,
    statuses?: OrderStatus[],
    campusId?: string,
    from?: string,
    to?: string,
  ) {
    // Order.vendorId référence Vendor.id, pas User.id : quand un VENDOR
    // liste ses propres commandes (vendorUserId = son User.id), il faut
    // résoudre son Vendor.id avant de filtrer — sinon aucune commande ne
    // matche jamais et la liste reste vide en permanence pour tout vendeur.
    let resolvedVendorId = vendorId;
    if (vendorUserId) {
      const vendor = await this.prisma.vendor.findUnique({ where: { userId: vendorUserId } });
      // Vendeur sans profil Vendor résolu : aucune commande ne peut lui
      // appartenir, on force un filtre qui ne matchera jamais plutôt que
      // de renvoyer toutes les commandes (fail-closed).
      resolvedVendorId = vendor ? vendor.id : '__no_vendor_profile__';
    }

    const skip = (page - 1) * limit;
    const createdAt = dateFilter(from, to);
    const where = {
      deletedAt: null,
      ...(studentId ? { studentId } : {}),
      ...(resolvedVendorId ? { vendorId: resolvedVendorId } : {}),
      ...(status ? { status } : {}),
      ...(statuses && statuses.length > 0 ? { status: { in: statuses } } : {}),
      ...(campusId ? { student: { campusId } } : {}),
      ...(createdAt ? { createdAt } : {}),
    };
    const [total, data] = await this.prisma.$transaction([
      this.prisma.order.count({ where }),
      this.prisma.order.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: {
          items: { include: ORDER_ITEMS_INCLUDE },
          student: { select: { id: true, firstName: true, lastName: true, campus: { select: { id: true, name: true } } } },
          vendor: { select: { id: true, canteenName: true } },
          takeawayOption: { select: { id: true, name: true } },
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

  async findOne(id: string, actor: Actor) {
    const order = await this.prisma.order.findUnique({
      where: { id, deletedAt: null },
      include: {
        items: { include: ORDER_ITEMS_INCLUDE },
        student: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            campus: { select: { id: true, name: true } },
          },
        },
        vendor: { select: { id: true, canteenName: true } },
        takeawayOption: { select: { id: true, name: true } },
      },
    });

    if (!order) throw new NotFoundException(`Commande avec l'identifiant ${id} introuvable`);

    await this.assertOwnership(order, actor);

    return order;
  }

  /**
   * Machine à états serveur : CONFIRMED → IN_PREPARATION → READY → RECEIVED,
   * dans l'ordre strict, sans saut ni retour en arrière. L'annulation ne passe
   * jamais par ici : voir cancel().
   */
  private static readonly NEXT_STATUS: Partial<Record<OrderStatus, OrderStatus>> = {
    [OrderStatus.CONFIRMED]: OrderStatus.IN_PREPARATION,
    [OrderStatus.IN_PREPARATION]: OrderStatus.READY,
    [OrderStatus.READY]: OrderStatus.RECEIVED,
  };

  async update(id: string, updateOrderDto: UpdateOrderDto, actor: Actor) {
    // L'étudiant ne change jamais le statut d'une commande.
    if (!actor.isAdmin && actor.role !== UserRole.VENDOR) {
      throw new ForbiddenException('Seuls la vendeuse et l’administrateur peuvent changer le statut d’une commande');
    }

    // findOne vérifie aussi que la commande appartient à la cantine de la vendeuse.
    const existing = await this.findOne(id, actor);

    const newStatus = updateOrderDto.status;
    if (newStatus === existing.status) return existing;

    if (newStatus === OrderStatus.CANCELLED) {
      throw new BadRequestException('Pour annuler une commande, utilisez POST /orders/:id/cancel');
    }
    if (OrdersService.NEXT_STATUS[existing.status] !== newStatus) {
      throw new BadRequestException(
        `Transition de commande interdite : ${existing.status} → ${newStatus}`,
      );
    }

    const changedById = actor.authKind === 'web' ? null : actor.id;

    const order = await this.prisma.$transaction(async (tx) => {
      const now = new Date();

      // Le changement de statut est « réclamé » avec la condition sur le statut
      // précédent, dans la même écriture. Une requête concurrente trouve un
      // statut déjà changé (count = 0) et échoue : le crédit de la vendeuse
      // ci-dessous ne peut donc jamais être appliqué deux fois.
      const claim = await tx.order.updateMany({
        where: { id, status: existing.status },
        data: {
          status: newStatus,
          ...(newStatus === OrderStatus.READY ? { readyAt: now } : {}),
          // RECEIVED libère le numéro : il peut être attribué aussitôt à une autre commande.
          ...(newStatus === OrderStatus.RECEIVED ? { receivedAt: now, activeOrderNumber: null } : {}),
        },
      });
      if (claim.count !== 1) {
        throw new BadRequestException('La commande a été modifiée entre-temps');
      }

      const order = await tx.order.findUnique({ where: { id } });
      if (!order) throw new NotFoundException(`Commande ${id} introuvable`);

      await tx.orderStatusHistory.create({
        data: { orderId: id, oldStatus: existing.status, newStatus, changedById },
      });

      // Crédit de la vendeuse : uniquement au passage à READY, tickets = FCFA
      // 1:1, sans commission, dans la transaction du changement de statut.
      if (newStatus === OrderStatus.READY) {
        const vendor = await tx.vendor.findUnique({ where: { id: order.vendorId } });
        if (!vendor) {
          throw new NotFoundException(`Vendeur de la commande ${order.id} introuvable`);
        }

        await tx.vendor.update({
          where: { id: order.vendorId },
          data: { balanceFcfa: { increment: order.totalTickets } },
        });

        await tx.transaction.create({
          data: {
            userId: vendor.userId,
            type: 'SALE',
            status: 'COMPLETED',
            amount: order.totalTickets,
            reference: crypto.randomUUID(),
            description: `Vente : commande ${order.id} prête`,
            relatedOrderId: order.id,
          },
        });
      }

      return order;
    });

    await this.notifyStudentOrderStatus(order.studentId, newStatus, order.vendorId);
    return order;
  }

  /**
   * Annulation.
   * - étudiant : ses propres commandes, tant qu'elles sont CONFIRMED ;
   * - vendeuse : les commandes de sa cantine, avant READY (CONFIRMED ou
   *   IN_PREPARATION) : elle n'est créditée qu'à READY ;
   * - le motif est obligatoire pour tous les auteurs ;
   * - personne n'annule une commande READY, RECEIVED ou déjà CANCELLED.
   * Remboursement intégral en tickets et restitution du stock réservé,
   * appliqués une seule fois : le changement de statut conditionnel, la
   * restitution et le remboursement sont dans la même transaction.
   */
  async cancel(orderId: string, dto: CancelOrderDto, actor: Actor) {
    // L'administrateur n'annule jamais une commande : refus avant toute lecture.
    if (actor.isAdmin) {
      throw new ForbiddenException("L'administrateur ne peut pas annuler une commande");
    }

    const order = await this.prisma.order.findFirst({
      where: { id: orderId, deletedAt: null },
    });
    if (!order) throw new NotFoundException(`Commande ${orderId} introuvable`);

    const reason = dto.reason?.trim() || undefined;

    let cancelledBy: OrderCancelledBy;
    let cancellableFrom: readonly OrderStatus[];
    if (actor.role === UserRole.STUDENT) {
      if (order.studentId !== actor.id) {
        throw new ForbiddenException('Vous ne pouvez annuler que vos propres commandes');
      }
      cancelledBy = OrderCancelledBy.STUDENT;
      cancellableFrom = [OrderStatus.CONFIRMED];
    } else if (actor.role === UserRole.VENDOR) {
      const vendor = await this.prisma.vendor.findUnique({ where: { userId: actor.id } });
      if (!vendor || vendor.id !== order.vendorId) {
        throw new ForbiddenException('Vous ne pouvez annuler que les commandes de votre cantine');
      }
      cancelledBy = OrderCancelledBy.VENDOR;
      cancellableFrom = [OrderStatus.CONFIRMED, OrderStatus.IN_PREPARATION];
    } else {
      throw new ForbiddenException('Vous ne pouvez pas annuler cette commande');
    }

    // Motif obligatoire pour tous les auteurs, contrôlé avant toute écriture.
    if (!reason) {
      throw new BadRequestException('Un motif est obligatoire pour annuler une commande');
    }

    if (order.status === OrderStatus.CANCELLED) {
      throw new BadRequestException('Cette commande est déjà annulée');
    }
    if (!cancellableFrom.includes(order.status)) {
      throw new BadRequestException(
        cancelledBy === OrderCancelledBy.STUDENT
          ? 'Vous ne pouvez annuler une commande que tant qu’elle est confirmée'
          : 'Une commande ne peut plus être annulée une fois prête ou récupérée',
      );
    }

    const changedById = actor.id;

    const updated = await this.prisma.$transaction(async (tx) => {
      // Réclamation conditionnelle sur le statut lu ci-dessus : en cas de
      // double annulation ou de passage concurrent à READY, une seule des
      // requêtes aboutit, donc le remboursement n'est appliqué qu'une fois.
      const claim = await tx.order.updateMany({
        where: { id: orderId, status: order.status },
        data: {
          status: OrderStatus.CANCELLED,
          cancelledAt: new Date(),
          cancelledBy,
          cancelledById: changedById,
          cancellationReason: reason,
          refundedTickets: order.totalTickets,
          // L'annulation libère le numéro, attribuable aussitôt à une autre commande.
          activeOrderNumber: null,
        },
      });
      if (claim.count !== 1) {
        throw new BadRequestException('La commande a été modifiée entre-temps : annulation impossible');
      }

      // Restitution du stock (CDC 33), avec les quantités exactes réservées à la
      // création (OrderItemComponent), agrégées par composant. Elle suit la
      // réclamation du statut et partage sa transaction : une seconde annulation
      // échoue à la réclamation, donc la restitution ne s'applique qu'une fois.
      // Même ordre (`id` croissant) et même séquence de verrous que la création
      // (composants avant portefeuille). Un composant supprimé logiquement depuis
      // la commande est restitué aussi : sa ligne existe toujours.
      const reservedLines = await tx.orderItemComponent.findMany({
        where: { orderItem: { orderId } },
        select: { componentId: true, quantity: true },
      });
      const reservedByComponent = new Map<string, number>();
      for (const line of reservedLines) {
        reservedByComponent.set(line.componentId, (reservedByComponent.get(line.componentId) ?? 0) + line.quantity);
      }
      for (const [componentId, quantity] of [...reservedByComponent].sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))) {
        await tx.component.update({
          where: { id: componentId },
          data: { quantity: { increment: quantity } },
        });
      }

      await tx.orderStatusHistory.create({
        data: {
          orderId,
          oldStatus: order.status,
          newStatus: OrderStatus.CANCELLED,
          changedById,
        },
      });

      await tx.user.update({
        where: { id: order.studentId },
        data: { walletBalance: { increment: order.totalTickets } },
      });

      await tx.transaction.create({
        data: {
          userId: order.studentId,
          type: 'REFUND',
          status: 'COMPLETED',
          amount: order.totalTickets,
          reference: crypto.randomUUID(),
          description: `Annulation de la commande ${orderId} : tickets remboursés`,
          relatedOrderId: orderId,
        },
      });

      return tx.order.findUnique({ where: { id: orderId } });
    });

    await this.notifyStudentOrderStatus(order.studentId, OrderStatus.CANCELLED, order.vendorId);
    return { order: updated };
  }

  private async notifyStudentOrderStatus(
    studentId: string,
    status: OrderStatus,
    vendorId: string,
  ) {
    const vendor = await this.prisma.vendor.findUnique({
      where: { id: vendorId },
      select: { canteenName: true },
    });
    const place = vendor?.canteenName?.trim() || 'ta cantine';
    const copy: Partial<
      Record<OrderStatus, { title: string; message: string; type: NotificationType }>
    > = {
      [OrderStatus.CONFIRMED]: {
        title: 'Commande confirmée',
        message: `Ta commande chez ${place} est confirmée.`,
        type: NotificationType.SUCCESS,
      },
      [OrderStatus.IN_PREPARATION]: {
        title: 'Commande en préparation',
        message: `${place} prépare ta commande.`,
        type: NotificationType.INFO,
      },
      [OrderStatus.READY]: {
        title: 'Commande prête',
        message: `Ta commande chez ${place} est prête. Va la récupérer.`,
        type: NotificationType.SUCCESS,
      },
      [OrderStatus.CANCELLED]: {
        title: 'Commande annulée',
        message: `Ta commande chez ${place} a été annulée. Tes tickets ont été remboursés.`,
        type: NotificationType.WARNING,
      },
    };
    const payload = copy[status];
    if (!payload) return;
    try {
      await this.notifications.notifyUser(
        studentId,
        payload.title,
        payload.message,
        payload.type,
      );
    } catch (error) {
      this.logger.error(
        `Notif commande impossible student=${studentId} status=${status}`,
        error instanceof Error ? error.stack : error,
      );
    }
  }
}
