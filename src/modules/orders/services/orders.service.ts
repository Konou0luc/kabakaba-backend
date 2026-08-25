import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { OrderStatus, UserRole } from '@prisma/client';
import { PrismaService } from '../../../database/services/prisma.service';
import { CreateOrderDto } from '../dto/create-order.dto';
import { UpdateOrderDto } from '../dto/update-order.dto';

interface Actor {
  id: string;
  role: UserRole;
}

@Injectable()
export class OrdersService {
  constructor(private readonly prisma: PrismaService) {}

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
    const isAdmin = actor.role === UserRole.ADMIN || actor.role === UserRole.SUPER_ADMIN;
    if (isAdmin) return;

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

    if (items.length === 0) {
      throw new BadRequestException('La commande doit contenir au moins un item');
    }

    const vendor = await this.prisma.vendor.findUnique({ where: { id: vendorId } });
    if (!vendor || !vendor.isActive || vendor.deletedAt) {
      throw new NotFoundException('Cantine introuvable ou inactive');
    }

    const menuItemIds = [...new Set(items.map((i) => i.itemId))];
    const menuItems = await this.prisma.menuItem.findMany({
      where: { id: { in: menuItemIds }, deletedAt: null },
    });
    const menuItemById = new Map(menuItems.map((mi) => [mi.id, mi]));

    const componentIds = [...new Set(items.flatMap((i) => (i.components ?? []).map((c) => c.componentId)))];
    const components = componentIds.length
      ? await this.prisma.menuComponent.findMany({ where: { id: { in: componentIds }, deletedAt: null } })
      : [];
    const componentById = new Map(components.map((c) => [c.id, c]));

    let totalTickets = 0;
    // Lignes prêtes à insérer une fois la commande créée (a besoin de orderId).
    const itemsToCreate: {
      itemId: string;
      quantity: number;
      unitPrice: number;
      components: { componentId: string; quantity: number }[];
    }[] = [];

    for (const inputItem of items) {
      const menuItem = menuItemById.get(inputItem.itemId);
      if (!menuItem) {
        throw new NotFoundException(`Item de menu introuvable : ${inputItem.itemId}`);
      }
      // SÉCURITÉ : tous les items commandés doivent appartenir au vendorId
      // annoncé — empêche de mélanger des items de plusieurs cantines dans
      // une seule commande/paiement.
      if (menuItem.vendorId !== vendorId) {
        throw new BadRequestException(`L'item "${menuItem.name}" n'appartient pas à cette cantine`);
      }
      if (!menuItem.isAvailable) {
        throw new BadRequestException(`L'item "${menuItem.name}" n'est plus disponible`);
      }

      totalTickets += menuItem.priceTickets * inputItem.quantity;

      const resolvedComponents: { componentId: string; quantity: number }[] = [];
      for (const inputComponent of inputItem.components ?? []) {
        const component = componentById.get(inputComponent.componentId);
        if (!component) {
          throw new NotFoundException(`Composant introuvable : ${inputComponent.componentId}`);
        }
        // SÉCURITÉ : un composant ne peut être choisi que pour l'item de
        // menu auquel il appartient réellement.
        if (component.itemId !== inputItem.itemId) {
          throw new BadRequestException(`Le composant "${component.name}" n'appartient pas à cet item`);
        }
        if (inputComponent.quantity < component.minQty || inputComponent.quantity > component.maxQty) {
          throw new BadRequestException(
            `Quantité invalide pour "${component.name}" (attendu entre ${component.minQty} et ${component.maxQty})`,
          );
        }

        totalTickets += component.unitPriceTickets * inputComponent.quantity;
        resolvedComponents.push({ componentId: component.id, quantity: inputComponent.quantity });
      }

      itemsToCreate.push({
        itemId: menuItem.id,
        quantity: inputItem.quantity,
        unitPrice: menuItem.priceTickets,
        components: resolvedComponents,
      });
    }

    if (packagingOptionId) {
      const packagingOption = await this.prisma.packagingOption.findUnique({
        where: { id: packagingOptionId, deletedAt: null },
        include: { menuItem: true },
      });
      if (!packagingOption) {
        throw new NotFoundException('Option de packaging introuvable');
      }
      if (packagingOption.menuItem.vendorId !== vendorId) {
        throw new BadRequestException("Cette option de packaging n'appartient pas à cette cantine");
      }
      totalTickets += packagingOption.extraCost;
    }

    // 1 ticket = 1 FCFA en séquestre (voir barème de recharge : le ticket
    // EST la monnaie de la plateforme, sans conversion supplémentaire ici).
    const escrowAmount = totalTickets;

    return this.prisma.$transaction(async (tx) => {
      const order = await tx.order.create({
        data: {
          vendorId,
          studentId,
          totalTickets,
          escrowAmount,
          packagingOptionId: packagingOptionId ?? null,
        },
      });

      for (const item of itemsToCreate) {
        const orderItem = await tx.orderItem.create({
          data: {
            orderId: order.id,
            itemId: item.itemId,
            quantity: item.quantity,
            unitPrice: item.unitPrice,
          },
        });
        for (const component of item.components) {
          await tx.orderItemComponent.create({
            data: {
              orderItemId: orderItem.id,
              componentId: component.componentId,
              quantity: component.quantity,
            },
          });
        }
      }

      return tx.order.findUnique({
        where: { id: order.id },
        include: { items: { include: { components: true } } },
      });
    });
  }

  async findAll(
    page: number = 1,
    limit: number = 10,
    studentId?: string,
    vendorId?: string,
    status?: OrderStatus,
  ) {
    const skip = (page - 1) * limit;
    const where = {
      deletedAt: null,
      ...(studentId ? { studentId } : {}),
      ...(vendorId ? { vendorId } : {}),
      ...(status ? { status } : {}),
    };
    const [total, data] = await this.prisma.$transaction([
      this.prisma.order.count({ where }),
      this.prisma.order.findMany({
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

  async findOne(id: string, actor: Actor) {
    const order = await this.prisma.order.findUnique({
      where: { id, deletedAt: null },
    });

    if (!order) throw new NotFoundException(`Commande avec l'identifiant ${id} introuvable`);

    await this.assertOwnership(order, actor);

    return order;
  }

  async update(id: string, updateOrderDto: UpdateOrderDto, actor: Actor) {
    await this.findOne(id, actor);
    // UpdateOrderDto ne contient que `status` désormais (voir sa définition :
    // volontairement détaché de CreateOrderDto, une commande ne se modifie
    // pas en changeant ses items/son prix après coup).
    return this.prisma.order.update({
      where: { id },
      data: updateOrderDto,
    });
  }

  async remove(id: string, actor: Actor) {
    await this.findOne(id, actor);
    return this.prisma.order.update({
      where: { id },
      data: { deletedAt: new Date() },
    });
  }
}
