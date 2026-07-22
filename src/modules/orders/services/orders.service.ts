import { Injectable, NotFoundException } from '@nestjs/common';
import { OrderStatus } from '@prisma/client';
import { PrismaService } from '../../../database/services/prisma.service';
import { CreateOrderDto } from '../dto/create-order.dto';
import { UpdateOrderDto } from '../dto/update-order.dto';

@Injectable()
export class OrdersService {
  constructor(private readonly prisma: PrismaService) {}

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

  async findOne(id: string) {
    const order = await this.prisma.order.findUnique({
      where: { id, deletedAt: null },
    });

    if (!order) throw new NotFoundException(`Commande avec l'identifiant ${id} introuvable`);

    return order;
  }

  async update(id: string, updateOrderDto: UpdateOrderDto) {
    await this.findOne(id);
    return this.prisma.order.update({
      where: { id },
      data: updateOrderDto,
    });
  }

  async remove(id: string) {
    await this.findOne(id);
    return this.prisma.order.update({
      where: { id },
      data: { deletedAt: new Date() },
    });
  }
}
