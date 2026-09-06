import { BadRequestException, ForbiddenException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { OrderStatus, UserRole } from '@prisma/client';
import * as crypto from 'crypto';
import { PrismaService } from '../../../database/services/prisma.service';
import { CreateOrderDto } from '../dto/create-order.dto';
import { UpdateOrderDto } from '../dto/update-order.dto';
import { RefundOrderDto } from '../dto/refund-order.dto';
import { AbuseService } from '../../abuse/services/abuse.service';

interface Actor {
  id: string;
  role?: UserRole;
  isAdmin: boolean;
  // 'web' = session admin dashboard (WebUser, pas de ligne User associée) ;
  // 'mobile' ou absent = compte User réel (étudiant/vendeur/admin mobile).
  // Distingue les deux car OrderStatusHistory.changedById référence User,
  // jamais WebUser : y stocker un id de WebUser violerait la contrainte FK.
  authKind?: 'mobile' | 'web';
}

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
    private readonly abuseService: AbuseService,
  ) {}

  /**
   * Un STUDENT ne peut accéder qu'à ses propres commandes, un VENDOR qu'aux
   * commandes de sa cantine. ADMIN/SUPER_ADMIN passent sans restriction.
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

  async create(createOrderDto: CreateOrderDto, studentId: string) {
    const { vendorId, items, packagingOptionId } = createOrderDto;

    return this.prisma.$transaction(async (tx) => {
      const vendor = await tx.vendor.findUnique({ where: { id: vendorId, deletedAt: null } });
      if (!vendor) throw new NotFoundException('Vendeur introuvable');
      if (!vendor.isActive) {
        throw new BadRequestException("Cette cantine n'accepte pas de commandes actuellement");
      }
      // CDC 3.3 : une cantine fermée par le vendeur (bascule manuelle ou
      // horaires programmés) ne doit jamais pouvoir recevoir de commande,
      // même si le mobile a un affichage périmé côté client.
      if (!vendor.isOpen) {
        throw new BadRequestException("Ce vendeur n'est pas disponible pour le moment");
      }

      const menuItemIds = items.map((i) => i.menuItemId);
      const menuItems = await tx.menuItem.findMany({
        where: { id: { in: menuItemIds }, deletedAt: null },
        include: { components: { where: { deletedAt: null } } },
      });
      const menuItemById = new Map(menuItems.map((m) => [m.id, m]));

      const allComponentIds = items.flatMap((i) => (i.components ?? []).map((c) => c.componentId));
      const menuComponents = allComponentIds.length
        ? await tx.menuComponent.findMany({ where: { id: { in: allComponentIds }, deletedAt: null } })
        : [];
      const componentById = new Map(menuComponents.map((c) => [c.id, c]));

      let totalTickets = 0;
      const orderItemsData: {
        itemId: string;
        quantity: number;
        unitPrice: number;
        components: { componentId: string; quantity: number }[];
      }[] = [];

      for (const requestedItem of items) {
        const menuItem = menuItemById.get(requestedItem.menuItemId);
        if (!menuItem) {
          throw new NotFoundException(`Menu item ${requestedItem.menuItemId} introuvable`);
        }
        if (menuItem.vendorId !== vendorId) {
          throw new BadRequestException(`Le menu "${menuItem.name}" n'appartient pas à ce vendeur`);
        }
        if (!menuItem.isAvailable) {
          throw new BadRequestException(`"${menuItem.name}" n'est pas disponible actuellement`);
        }

        let componentsUnitTotal = 0;
        const resolvedComponents: { componentId: string; quantity: number }[] = [];

        for (const requestedComponent of requestedItem.components ?? []) {
          const component = componentById.get(requestedComponent.componentId);
          if (!component) {
            throw new NotFoundException(`Composant ${requestedComponent.componentId} introuvable`);
          }
          if (component.itemId !== menuItem.id) {
            throw new BadRequestException(
              `Le composant "${component.name}" n'appartient pas à "${menuItem.name}"`,
            );
          }
          if (requestedComponent.quantity < component.minQty || requestedComponent.quantity > component.maxQty) {
            throw new BadRequestException(
              `Quantité invalide pour "${component.name}" (attendu entre ${component.minQty} et ${component.maxQty})`,
            );
          }
          componentsUnitTotal += component.unitPriceTickets * requestedComponent.quantity;
          resolvedComponents.push({ componentId: component.id, quantity: requestedComponent.quantity });
        }

        // Composants obligatoires (minQty > 0) non fournis par le client : rejeter.
        const requiredComponentIds = menuItem.components
          .filter((c) => c.minQty > 0)
          .map((c) => c.id);
        const providedComponentIds = new Set(resolvedComponents.map((c) => c.componentId));
        const missing = requiredComponentIds.filter((id) => !providedComponentIds.has(id));
        if (missing.length > 0) {
          throw new BadRequestException(`Composant(s) obligatoire(s) manquant(s) pour "${menuItem.name}"`);
        }

        // Prix fixé par le vendeur en base (priceTickets, unitPriceTickets) —
        // jamais fourni par le client : c'est le calcul serveur.
        const unitPrice = menuItem.priceTickets + componentsUnitTotal;
        totalTickets += unitPrice * requestedItem.quantity;

        orderItemsData.push({
          itemId: menuItem.id,
          quantity: requestedItem.quantity,
          unitPrice,
          components: resolvedComponents,
        });
      }

      let packagingExtraCost = 0;
      if (packagingOptionId) {
        const packaging = await tx.packagingOption.findUnique({
          where: { id: packagingOptionId, deletedAt: null },
        });
        if (!packaging) throw new NotFoundException("Option d'emballage introuvable");
        if (!menuItemIds.includes(packaging.itemId)) {
          throw new BadRequestException(
            "Cette option d'emballage ne correspond à aucun des articles commandés",
          );
        }
        packagingExtraCost = packaging.extraCost;
      } else {
        // Aucun emballage choisi : vérifier qu'aucun item commandé n'en impose un.
        const requiredPackaging = await tx.packagingOption.findFirst({
          where: { itemId: { in: menuItemIds }, required: true, deletedAt: null },
        });
        if (requiredPackaging) {
          throw new BadRequestException("Un choix d'emballage est requis pour cette commande");
        }
      }

      totalTickets += packagingExtraCost;

      // Tickets = FCFA en séquestre, conversion 1:1 : aucune commission sur
      // les commandes (contrairement aux recharges wallet, qui ont leur
      // propre barème — voir recharge-pricing.ts).
      const escrowAmount = totalTickets;

      // MISE EN SÉQUESTRE : avant ce correctif, aucune ligne de ce service
      // ne vérifiait le solde de l'étudiant ni ne débitait son wallet à la
      // commande — Order.escrowAmount n'était qu'un nombre stocké sans
      // aucun effet financier réel. Débit conditionnel atomique (même
      // pattern que wallet.service.ts pour les transferts) : la clause
      // walletBalance >= totalTickets dans le where empêche toute commande
      // au-delà du solde disponible, y compris en cas de requêtes concurrentes.
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
          totalTickets,
          escrowAmount,
          packagingOptionId: packagingOptionId ?? null,
          items: {
            create: orderItemsData.map((item) => ({
              itemId: item.itemId,
              quantity: item.quantity,
              unitPrice: item.unitPrice,
              components: {
                create: item.components.map((c) => ({
                  componentId: c.componentId,
                  quantity: c.quantity,
                })),
              },
            })),
          },
        },
        include: { items: { include: { components: true } } },
      });

      await tx.transaction.create({
        data: {
          userId: studentId,
          type: 'ESCROW_LOCK',
          status: 'COMPLETED',
          amount: escrowAmount,
          reference: crypto.randomUUID(),
          description: `Mise en séquestre pour la commande ${order.id}`,
          relatedOrderId: order.id,
        },
      });

      return order;
    });
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
          student: { select: { id: true, firstName: true, lastName: true, campus: { select: { id: true, name: true } } } },
          vendor: { select: { id: true, canteenName: true } },
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
    });

    if (!order) throw new NotFoundException(`Commande avec l'identifiant ${id} introuvable`);

    await this.assertOwnership(order, actor);

    return order;
  }

  // Champs qu'un VENDOR peut modifier sur une commande. Les champs métier
  // sensibles (vendorId, totalTickets, escrowAmount, packagingOptionId) ne
  // sont modifiables que par un admin.
  private static readonly VENDOR_UPDATABLE_FIELDS = ['status'] as const;

  async update(id: string, updateOrderDto: UpdateOrderDto, actor: Actor) {
    const existing = await this.findOne(id, actor);

    let data: Partial<UpdateOrderDto> = updateOrderDto;

    if (!actor.isAdmin) {
      // SÉCURITÉ : UpdateOrderDto hérite de tous les champs de CreateOrderDto
      // (vendorId, totalTickets, escrowAmount, packagingOptionId). On filtre
      // explicitement pour qu'un vendeur ne puisse changer que le statut de
      // SA commande, jamais son montant ou son propriétaire.
      data = {};
      for (const field of OrdersService.VENDOR_UPDATABLE_FIELDS) {
        if (updateOrderDto[field] !== undefined) {
          (data as any)[field] = updateOrderDto[field];
        }
      }
    }

    const newStatus = data.status;

    // Le remboursement d'une commande passe obligatoirement par la
    // résolution d'un litige (disputes.service.ts gère déjà tout le calcul :
    // solde vendeur insuffisant, créance, etc.) — jamais par ce PATCH
    // générique, qui n'a aucune de ces garde-fous.
    if (newStatus === 'REFUNDED') {
      throw new BadRequestException(
        "Un remboursement doit passer par la résolution d'un litige (POST /disputes puis PATCH /disputes/:id), pas par cet endpoint",
      );
    }

    if (!newStatus || newStatus === existing.status) {
      return this.prisma.order.update({ where: { id }, data });
    }

    // changedById référence User, jamais WebUser : un admin connecté depuis
    // le dashboard web n'a pas de ligne User, donc pas d'auteur enregistré
    // pour cette transition (le champ est optionnel).
    const changedById = actor.authKind === 'web' ? null : actor.id;

    return this.prisma.$transaction(async (tx) => {
      const order = await tx.order.update({ where: { id }, data });

      await tx.orderStatusHistory.create({
        data: { orderId: id, oldStatus: existing.status, newStatus, changedById },
      });

      // LIBÉRATION D'ESCROW : au premier passage à READY (le vendeur a
      // préparé la commande), pas à RECEIVED/AUTO_RECEIVED qui ne sont que
      // des confirmations sans effet financier supplémentaire.
      //
      // CDC 4.7 — recouvrement automatique de créance : si le vendeur a une
      // Debt non soldée, le crédit entrant sert d'abord à la résorber
      // (FIFO sur les créances ouvertes). Seul le reliquat alimente
      // balanceFcfa. debtFcfa est décrémenté en miroir.
      if (newStatus === 'READY' && existing.status !== 'READY') {
        const credit = Number(order.escrowAmount);

        const vendor = await tx.vendor.findUnique({
          where: { id: order.vendorId },
        });
        if (!vendor) {
          throw new NotFoundException(`Vendeur de la commande ${order.id} introuvable`);
        }

        const openDebts = await tx.debt.findMany({
          where: {
            vendorId: order.vendorId,
            isRecovered: false,
            deletedAt: null,
            remainingAmount: { gt: 0 },
          },
          orderBy: { createdAt: 'asc' },
        });

        let remainingCredit = credit;
        let totalRecovered = 0;

        for (const debt of openDebts) {
          if (remainingCredit <= 0) break;

          const debtRemaining = Number(debt.remainingAmount);
          const recovered = Math.min(remainingCredit, debtRemaining);
          const newRemaining = debtRemaining - recovered;

          await tx.debt.update({
            where: { id: debt.id },
            data: {
              remainingAmount: newRemaining,
              ...(newRemaining <= 0 ? { isRecovered: true } : {}),
            },
          });

          remainingCredit -= recovered;
          totalRecovered += recovered;
        }

        const currentDebtFcfa = Number(vendor.debtFcfa);
        const newDebtFcfa = Math.max(0, currentDebtFcfa - totalRecovered);

        await tx.vendor.update({
          where: { id: order.vendorId },
          data: {
            balanceFcfa: { increment: remainingCredit },
            debtFcfa: newDebtFcfa,
          },
        });

        // Grand livre : libération intégrale du séquestre (flux commande → vendeur).
        await tx.transaction.create({
          data: {
            userId: vendor.userId,
            type: 'ESCROW_RELEASE',
            status: 'COMPLETED',
            amount: credit,
            reference: crypto.randomUUID(),
            description: `Libération du séquestre à la préparation de la commande ${order.id}`,
            relatedOrderId: order.id,
          },
        });

        // Grand livre : part du crédit absorbée par les créances plateforme.
        if (totalRecovered > 0) {
          await tx.transaction.create({
            data: {
              userId: vendor.userId,
              type: 'DEBT_RECOVERY',
              status: 'COMPLETED',
              amount: totalRecovered,
              reference: crypto.randomUUID(),
              description: `Recouvrement automatique de créance sur libération séquestre commande ${order.id}`,
              relatedOrderId: order.id,
            },
          });
        }
      }

      // ANNULATION : le séquestre n'a jamais été consommé, il retourne
      // intégralement à l'étudiant. Ne s'applique que si l'escrow n'avait
      // pas déjà été libéré au vendeur (donc jamais après READY).
      if (
        (newStatus === 'REFUSED' || newStatus === 'CANCELLED_VENDOR') &&
        existing.status !== 'REFUSED' &&
        existing.status !== 'CANCELLED_VENDOR'
      ) {
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
            description: `Annulation de la commande ${order.id}, séquestre restitué à l'étudiant`,
            relatedOrderId: order.id,
          },
        });
      }

      return order;
    });
  }

  async remove(id: string, actor: Actor) {
    await this.findOne(id, actor);
    return this.prisma.order.update({
      where: { id },
      data: { deletedAt: new Date() },
    });
  }

  /**
   * CDC 4.3 — commandes PENDING depuis plus de 5 minutes → CANCELLED_VENDOR
   * + restitution du séquestre à l'étudiant. Déclenché par cron interne.
   */
  async processPendingTimeouts() {
    const cutoff = new Date(Date.now() - 5 * 60 * 1000);
    const expired = await this.prisma.order.findMany({
      where: {
        status: OrderStatus.PENDING,
        deletedAt: null,
        createdAt: { lte: cutoff },
      },
      select: { id: true, studentId: true, totalTickets: true },
    });

    let processed = 0;
    for (const order of expired) {
      try {
        await this.prisma.$transaction(async (tx) => {
          const claim = await tx.order.updateMany({
            where: { id: order.id, status: OrderStatus.PENDING },
            data: { status: OrderStatus.CANCELLED_VENDOR },
          });
          if (claim.count === 0) return;

          await tx.orderStatusHistory.create({
            data: {
              orderId: order.id,
              oldStatus: OrderStatus.PENDING,
              newStatus: OrderStatus.CANCELLED_VENDOR,
              changedById: null,
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
              description: `Timeout 5 min — vendeur indisponible, séquestre restitué (commande ${order.id})`,
              relatedOrderId: order.id,
            },
          });
        });
        processed += 1;
      } catch (err) {
        this.logger.error(`Timeout PENDING échoué pour ${order.id}: ${err}`);
      }
    }

    const summary = { scanned: expired.length, processed, at: new Date().toISOString() };
    this.logger.log(`Cron order-pending-timeout: ${JSON.stringify(summary)}`);
    return summary;
  }

  /**
   * CDC 4.6 — commandes READY depuis plus d'1 heure → AUTO_RECEIVED
   * (aucun mouvement financier : le débit a déjà eu lieu à READY).
   */
  async processReadyAutoReceive() {
    const cutoff = new Date(Date.now() - 60 * 60 * 1000);
    // ready_at n'est pas forcément rempli : on s'appuie sur updatedAt du passage READY
    // via OrderStatusHistory si disponible, sinon updatedAt de la commande.
    const readyOrders = await this.prisma.order.findMany({
      where: {
        status: OrderStatus.READY,
        deletedAt: null,
        updatedAt: { lte: cutoff },
      },
      select: { id: true },
    });

    let processed = 0;
    for (const order of readyOrders) {
      try {
        // Vérifie que le passage à READY date bien de plus d'1h
        const readyEvent = await this.prisma.orderStatusHistory.findFirst({
          where: { orderId: order.id, newStatus: OrderStatus.READY },
          orderBy: { createdAt: 'desc' },
        });
        const readyAt = readyEvent?.createdAt ?? null;
        if (readyAt && readyAt > cutoff) continue;

        const claim = await this.prisma.order.updateMany({
          where: { id: order.id, status: OrderStatus.READY },
          data: { status: OrderStatus.AUTO_RECEIVED },
        });
        if (claim.count === 0) continue;

        await this.prisma.orderStatusHistory.create({
          data: {
            orderId: order.id,
            oldStatus: OrderStatus.READY,
            newStatus: OrderStatus.AUTO_RECEIVED,
            changedById: null,
          },
        });
        processed += 1;
      } catch (err) {
        this.logger.error(`AUTO_RECEIVED échoué pour ${order.id}: ${err}`);
      }
    }

    const summary = { scanned: readyOrders.length, processed, at: new Date().toISOString() };
    this.logger.log(`Cron order-auto-receive: ${JSON.stringify(summary)}`);
    return summary;
  }

  /**
   * Annulation par l'étudiant — uniquement en PENDING (avant acceptation vendeur).
   * Restitue le séquestre + enregistre l'anti-abus.
   */
  async cancelByStudent(orderId: string, studentId: string) {
    const order = await this.prisma.order.findFirst({
      where: { id: orderId, deletedAt: null },
    });
    if (!order) throw new NotFoundException(`Commande ${orderId} introuvable`);
    if (order.studentId !== studentId) {
      throw new ForbiddenException('Vous ne pouvez annuler que vos propres commandes');
    }
    if (order.status !== OrderStatus.PENDING) {
      throw new BadRequestException(
        'Seules les commandes en attente (PENDING) peuvent être annulées par l\'étudiant',
      );
    }

    const updated = await this.prisma.$transaction(async (tx) => {
      const claim = await tx.order.updateMany({
        where: { id: orderId, status: OrderStatus.PENDING },
        data: { status: OrderStatus.CANCELLED_STUDENT },
      });
      if (claim.count === 0) {
        throw new BadRequestException('La commande n\'est plus en attente');
      }

      await tx.orderStatusHistory.create({
        data: {
          orderId,
          oldStatus: OrderStatus.PENDING,
          newStatus: OrderStatus.CANCELLED_STUDENT,
          changedById: studentId,
        },
      });

      await tx.user.update({
        where: { id: studentId },
        data: { walletBalance: { increment: order.totalTickets } },
      });

      await tx.transaction.create({
        data: {
          userId: studentId,
          type: 'REFUND',
          status: 'COMPLETED',
          amount: order.totalTickets,
          reference: crypto.randomUUID(),
          description: `Annulation étudiant — séquestre restitué (commande ${orderId})`,
          relatedOrderId: orderId,
        },
      });

      return tx.order.findUnique({ where: { id: orderId } });
    });

    const abuse = await this.abuseService.trackStudentCancellation(studentId);

    return { order: updated, abuse };
  }

  /**
   * CDC 4.7 — remboursement post-READY déclenché par le vendeur (mobile).
   * Solde suffisant → débit vendeur + crédit étudiant.
   * Solde insuffisant → avance plateforme + Debt + debtFcfa.
   */
  async refundByVendor(orderId: string, vendorUserId: string, dto: { reason: string }) {
    const reason = dto.reason?.trim();
    if (!reason || reason.length < 3) {
      throw new BadRequestException('Motif de remboursement obligatoire');
    }

    const vendor = await this.prisma.vendor.findUnique({ where: { userId: vendorUserId } });
    if (!vendor) throw new NotFoundException('Profil vendeur introuvable');

    const order = await this.prisma.order.findFirst({
      where: { id: orderId, deletedAt: null },
    });
    if (!order) throw new NotFoundException(`Commande ${orderId} introuvable`);
    if (order.vendorId !== vendor.id) {
      throw new ForbiddenException('Cette commande ne appartient pas à votre cantine');
    }
    if (order.status !== OrderStatus.READY && order.status !== OrderStatus.RECEIVED && order.status !== OrderStatus.AUTO_RECEIVED) {
      throw new BadRequestException(
        'Un remboursement vendeur n\'est possible qu\'après l\'état READY (commande prête ou reçue)',
      );
    }

    const refundAmount = order.totalTickets;

    return this.prisma.$transaction(async (tx) => {
      const claim = await tx.order.updateMany({
        where: {
          id: orderId,
          status: { in: [OrderStatus.READY, OrderStatus.RECEIVED, OrderStatus.AUTO_RECEIVED] },
        },
        data: { status: OrderStatus.REFUNDED },
      });
      if (claim.count === 0) {
        throw new BadRequestException('Commande déjà remboursée ou statut incompatible');
      }

      await tx.orderStatusHistory.create({
        data: {
          orderId,
          oldStatus: order.status,
          newStatus: OrderStatus.REFUNDED,
          changedById: vendorUserId,
        },
      });

      const freshVendor = await tx.vendor.findUnique({ where: { id: vendor.id } });
      const vendorBalance = Number(freshVendor!.balanceFcfa);
      const debitFromVendor = Math.min(vendorBalance, refundAmount);
      const platformAdvance = refundAmount - debitFromVendor;

      await tx.vendor.update({
        where: { id: vendor.id },
        data: {
          balanceFcfa: { decrement: debitFromVendor },
          ...(platformAdvance > 0 ? { debtFcfa: { increment: platformAdvance } } : {}),
        },
      });

      if (platformAdvance > 0) {
        await tx.debt.create({
          data: {
            vendorId: vendor.id,
            amount: platformAdvance,
            remainingAmount: platformAdvance,
            reason: `Avance plateforme — remboursement vendeur commande ${orderId} : ${reason}`,
          },
        });
      }

      await tx.user.update({
        where: { id: order.studentId },
        data: { walletBalance: { increment: refundAmount } },
      });

      await tx.transaction.create({
        data: {
          userId: order.studentId,
          type: 'REFUND',
          status: 'COMPLETED',
          amount: refundAmount,
          reference: crypto.randomUUID(),
          description: `Remboursement vendeur post-READY (commande ${orderId}) : ${reason}`,
          relatedOrderId: orderId,
        },
      });

      if (debitFromVendor > 0) {
        await tx.transaction.create({
          data: {
            userId: vendor.userId,
            type: 'PAYMENT',
            status: 'COMPLETED',
            amount: debitFromVendor,
            reference: crypto.randomUUID(),
            description: `Débit remboursement commande ${orderId}`,
            relatedOrderId: orderId,
          },
        });
      }

      return {
        order: await tx.order.findUnique({ where: { id: orderId } }),
        refundAmount,
        debitFromVendor,
        platformAdvance,
        reason,
      };
    });
  }
}
