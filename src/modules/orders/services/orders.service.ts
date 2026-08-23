import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
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
    return this.prisma.order.create({
      data: {
        ...createOrderDto,
        studentId,
      },
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
