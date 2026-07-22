import { Injectable, NotFoundException } from '@nestjs/common';
import { TransactionType, TransactionStatus } from '@prisma/client';
import { PrismaService } from '../../../database/services/prisma.service';
import { CreateTransactionDto } from '../dto/create-transaction.dto';
import { UpdateTransactionDto } from '../dto/update-transaction.dto';

@Injectable()
export class TransactionsService {
  constructor(private readonly prisma: PrismaService) {}

  async create(createTransactionDto: CreateTransactionDto, userId: string) {
    return this.prisma.transaction.create({
      data: {
        ...createTransactionDto,
        userId,
      },
    });
  }

  async findAll(
    page: number = 1,
    limit: number = 10,
    userId?: string,
    type?: TransactionType,
    status?: TransactionStatus,
  ) {
    const skip = (page - 1) * limit;
    const where = {
      ...(userId ? { userId } : {}),
      ...(type ? { type } : {}),
      ...(status ? { status } : {}),
    };
    const [total, data] = await this.prisma.$transaction([
      this.prisma.transaction.count({ where }),
      this.prisma.transaction.findMany({
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
    const transaction = await this.prisma.transaction.findUnique({
      where: { id },
    });

    if (!transaction) throw new NotFoundException(`Transaction avec l'identifiant ${id} introuvable`);

    return transaction;
  }

  // In most cases, transactions shouldn't be updated/deleted, but we'll include for completeness
  async update(id: string, updateTransactionDto: UpdateTransactionDto) {
    await this.findOne(id);
    return this.prisma.transaction.update({
      where: { id },
      data: updateTransactionDto,
    });
  }
}
