import { Injectable, NotFoundException, ForbiddenException } from '@nestjs/common';
import { TransactionType, TransactionStatus, OrderStatus } from '@prisma/client';
import { PrismaService } from '../../../database/services/prisma.service';
import { CreateTransactionDto } from '../dto/create-transaction.dto';
import { UpdateTransactionDto } from '../dto/update-transaction.dto';

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
export class TransactionsService {
  constructor(private readonly prisma: PrismaService) {}

  // KPIs de la page Transactions (dashboard admin web) : volume du jour,
  // séquestre en cours (Order, pas Transaction — le séquestre est un état
  // courant de la commande, pas un événement du grand livre), débits
  // complétés, remboursements, créances actives.
  async getStats() {
    const startOfToday = new Date();
    startOfToday.setHours(0, 0, 0, 0);

    // La libération d'escrow (crédit du vendeur) se produit dès READY,
    // pas à RECEIVED/AUTO_RECEIVED qui ne sont que des confirmations sans
    // effet financier — voir orders.service.ts.
    const ESCROWED_STATUSES: OrderStatus[] = ['PENDING', 'ACCEPTED', 'IN_PREPARATION'];
    const DEBITED_STATUSES: OrderStatus[] = ['READY', 'RECEIVED', 'AUTO_RECEIVED'];

    const [
      transactionsToday,
      escrowedOrders,
      debitedOrders,
      refundedOrders,
      activeDebts,
    ] = await Promise.all([
      this.prisma.transaction.count({ where: { createdAt: { gte: startOfToday } } }),
      this.prisma.order.aggregate({
        where: { deletedAt: null, status: { in: ESCROWED_STATUSES } },
        _sum: { escrowAmount: true },
        _count: true,
      }),
      this.prisma.order.aggregate({
        where: { deletedAt: null, status: { in: DEBITED_STATUSES } },
        _sum: { escrowAmount: true },
      }),
      this.prisma.order.aggregate({
        where: { deletedAt: null, status: 'REFUNDED' },
        _sum: { escrowAmount: true },
        _count: true,
      }),
      this.prisma.debt.findMany({
        where: { deletedAt: null, isRecovered: false },
        select: { vendorId: true, remainingAmount: true },
      }),
    ]);

    const activeDebtsTotal = activeDebts.reduce((sum, d) => sum + Number(d.remainingAmount), 0);
    const activeDebtsVendorCount = new Set(activeDebts.map((d) => d.vendorId)).size;

    return {
      transactionsToday,
      escrow: { total: Number(escrowedOrders._sum.escrowAmount ?? 0), count: escrowedOrders._count },
      debitsCompleted: Number(debitedOrders._sum.escrowAmount ?? 0),
      refunds: { total: Number(refundedOrders._sum.escrowAmount ?? 0), count: refundedOrders._count },
      activeDebts: { total: activeDebtsTotal, vendorCount: activeDebtsVendorCount },
    };
  }

  // Liste des créances actives (Debt), pour l'onglet Créances — modèle
  // jusqu'ici exposé par aucun contrôleur.
  async findActiveDebts() {
    const debts = await this.prisma.debt.findMany({
      where: { deletedAt: null, isRecovered: false },
      orderBy: { createdAt: 'desc' },
      include: {
        vendor: {
          select: {
            id: true,
            canteenName: true,
            balanceFcfa: true,
            user: { select: { firstName: true, lastName: true } },
            campuses: { select: { campus: { select: { name: true } } } },
          },
        },
      },
    });

    return debts.map((d) => ({
      id: d.id,
      vendorId: d.vendorId,
      canteenName: d.vendor.canteenName,
      ownerName: `${d.vendor.user?.firstName ?? ''} ${d.vendor.user?.lastName ?? ''}`.trim() || '—',
      campusName: d.vendor.campuses[0]?.campus.name ?? '—',
      amount: Number(d.amount),
      remainingAmount: Number(d.remainingAmount),
      recoveredAmount: Number(d.amount) - Number(d.remainingAmount),
      vendorBalance: Number(d.vendor.balanceFcfa),
      reason: d.reason,
      createdAt: d.createdAt,
    }));
  }

  async create(createTransactionDto: CreateTransactionDto, userId: string) {
    return this.prisma.transaction.create({
      data: {
        ...createTransactionDto,
        userId,
      },
    });
  }

  private readonly displayInclude = {
    user: { select: { id: true, firstName: true, lastName: true, role: true, campus: { select: { name: true } } } },
    sender: { select: { id: true, firstName: true, lastName: true } },
    receiver: { select: { id: true, firstName: true, lastName: true } },
    relatedOrder: {
      select: { id: true, totalTickets: true, status: true, vendor: { select: { id: true, canteenName: true } } },
    },
    relatedPayment: { select: { id: true, operator: true, amountFcfa: true, status: true } },
  } as const;

  async findAll(
    page: number = 1,
    limit: number = 10,
    userId?: string,
    type?: TransactionType,
    status?: TransactionStatus,
    vendorId?: string,
    campusId?: string,
    from?: string,
    to?: string,
  ) {
    const skip = (page - 1) * limit;
    const createdAt = dateFilter(from, to);
    const where = {
      ...(userId ? { userId } : {}),
      ...(type ? { type } : {}),
      ...(status ? { status } : {}),
      ...(vendorId
        ? { OR: [{ relatedOrder: { vendorId } }, { user: { vendor: { id: vendorId } } }] }
        : {}),
      ...(campusId ? { user: { campusId } } : {}),
      ...(createdAt ? { createdAt } : {}),
    };
    const [total, data] = await this.prisma.$transaction([
      this.prisma.transaction.count({ where }),
      this.prisma.transaction.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: this.displayInclude,
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

  async findOne(id: string, actor?: { id: string; isAdmin: boolean }) {
    const transaction = await this.prisma.transaction.findUnique({
      where: { id },
      include: this.displayInclude,
    });

    if (!transaction) throw new NotFoundException(`Transaction avec l'identifiant ${id} introuvable`);

    if (actor && !actor.isAdmin) {
      const isParty = transaction.senderId === actor.id || transaction.receiverId === actor.id;
      if (!isParty) {
        throw new ForbiddenException("Vous n'avez pas accès à cette transaction");
      }
    }

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
