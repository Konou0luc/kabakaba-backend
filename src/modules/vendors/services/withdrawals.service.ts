import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  NotificationType,
  Prisma,
  UserRole,
  WebUserRole,
  WithdrawalAppealStatus,
  WithdrawalAppealType,
  WithdrawalStatus,
} from '@prisma/client';
import * as crypto from 'crypto';
import { PrismaService } from '../../../database/services/prisma.service';
import { NotificationsService } from '../../notifications/services/notifications.service';
import { CreateWithdrawalDto } from '../dto/create-withdrawal.dto';
import { CreateWithdrawalAppealDto, WithdrawalAppealTypeDto } from '../dto/withdrawal-action.dto';
import { computeWithdrawalFees, MobileOperator } from '../pricing/withdrawal-fees';

interface UploadedProofFile {
  buffer: Buffer;
  size: number;
  originalname?: string;
}

interface Actor {
  id: string;
  kind?: 'mobile' | 'web';
  role?: UserRole | WebUserRole;
  isAdmin?: boolean;
}

const APPEAL_WINDOW_MS = 60 * 60 * 1000;

@Injectable()
export class WithdrawalsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService,
  ) {}

  preview(amount: number, operator: MobileOperator) {
    if (!Number.isFinite(amount) || amount <= 0) {
      throw new BadRequestException('Montant de retrait invalide');
    }
    const fees = computeWithdrawalFees(amount, operator);
    return this.toRecap(fees);
  }

  async request(dto: CreateWithdrawalDto, actor: Actor) {
    const amount = Number(dto.amount);
    if (!Number.isFinite(amount) || amount <= 0) {
      throw new BadRequestException('Montant de retrait invalide');
    }
    const operator = (dto.operator || 'MIXX') as MobileOperator;

    const vendor = await this.prisma.vendor.findUnique({
      where: { userId: actor.id },
      include: { user: { select: { id: true, firstName: true, lastName: true, phone: true } } },
    });
    if (!vendor || vendor.deletedAt) throw new NotFoundException('Profil vendeur introuvable');
    if (!vendor.isActive) throw new ForbiddenException('Compte vendeur inactif — retrait impossible');
    if (Number(vendor.debtFcfa) > 0) {
      throw new BadRequestException(
        `Vous avez une créance de ${Number(vendor.debtFcfa)} FCFA. Veuillez la régulariser avant de retirer.`,
      );
    }

    const fees = computeWithdrawalFees(amount, operator);
    const totalDebit = fees.debitedFromBalance;

    const result = await this.prisma.$transaction(async (tx) => {
      const debit = await tx.vendor.updateMany({
        where: { id: vendor.id, debtFcfa: { lte: 0 }, balanceFcfa: { gte: totalDebit } },
        data: { balanceFcfa: { decrement: totalDebit } },
      });
      if (debit.count === 0) {
        throw new BadRequestException(`Solde insuffisant. Requis : ${totalDebit} FCFA.`);
      }

      const withdrawal = await tx.withdrawal.create({
        data: {
          vendorId: vendor.id,
          amount,
          platformFee: fees.cashOutFee,
          operatorFee: fees.fedapayFee,
          debitedAmount: totalDebit,
          feeRetained: fees.vendorBorneFedapayFee,
          operator,
          // Conservé pour le barème produit : il représente le montant que
          // l'opérateur manuel doit effectivement envoyer au vendeur.
          payoutAmount: fees.payoutAmountToSend,
          status: WithdrawalStatus.PENDING,
        },
      });

      await tx.transaction.create({
        data: {
          userId: vendor.userId,
          type: 'WITHDRAWAL',
          status: 'PENDING',
          amount: totalDebit,
          reference: withdrawal.id,
          description:
            `Demande de retrait ${amount} FCFA via ${operator}. ` +
            `Net à envoyer : ${fees.payoutAmountToSend} FCFA. ` +
            `Frais conservés par Kabakaba : ${fees.vendorBorneFedapayFee} FCFA.`,
        },
      });

      return withdrawal;
    });

    await this.notifications.notifyUser(
      vendor.userId,
      'Demande de retrait reçue',
      `Votre demande de retrait de ${amount} FCFA a été enregistrée. Veuillez patienter, le transfert sera effectué prochainement.`,
      NotificationType.INFO,
    );

    return {
      withdrawal: result,
      recap: this.toRecap(fees),
      message: 'Votre demande a été enregistrée. Veuillez patienter, le transfert sera effectué prochainement.',
    };
  }

  async findMine(actor: Actor, page = 1, limit = 10) {
    const vendor = await this.prisma.vendor.findUnique({ where: { userId: actor.id } });
    if (!vendor) throw new NotFoundException('Profil vendeur introuvable');
    const skip = (page - 1) * limit;
    const where = { vendorId: vendor.id, deletedAt: null };
    const [total, data] = await this.prisma.$transaction([
      this.prisma.withdrawal.count({ where }),
      this.prisma.withdrawal.findMany({ where, skip, take: limit, orderBy: { createdAt: 'desc' } }),
    ]);
    return { data, meta: { page, limit, total, totalPages: Math.ceil(total / limit) } };
  }

  async getStats() {
    const grouped = await this.prisma.withdrawal.groupBy({
      by: ['status'],
      where: { deletedAt: null },
      _count: true,
      _sum: { debitedAmount: true },
    });
    const byStatus = Object.fromEntries(
      grouped.map((g) => [g.status, { count: g._count, total: Number(g._sum.debitedAmount ?? 0) }]),
    );
    const zero = { count: 0, total: 0 };
    return {
      pending: byStatus.PENDING ?? zero,
      processing: byStatus.PROCESSING ?? zero,
      completed: byStatus.COMPLETED ?? zero,
      failed: byStatus.FAILED ?? zero,
      cancelled: byStatus.CANCELLED ?? zero,
    };
  }

  async findAll(page = 1, limit = 10, status?: WithdrawalStatus, from?: string, to?: string) {
    const skip = (page - 1) * limit;
    let createdAt: { gte?: Date; lte?: Date } | undefined;
    if (from || to) {
      const until = to ? new Date(to) : new Date();
      if (Number.isNaN(until.getTime())) throw new BadRequestException('Date de fin invalide');
      until.setHours(23, 59, 59, 999);
      const start = from ? new Date(from) : undefined;
      if (start && Number.isNaN(start.getTime())) throw new BadRequestException('Date de début invalide');
      createdAt = { ...(start ? { gte: start } : {}), lte: until };
    }
    const where = {
      deletedAt: null,
      ...(status ? { status } : {}),
      ...(createdAt ? { createdAt } : {}),
    };
    const [total, data] = await this.prisma.$transaction([
      this.prisma.withdrawal.count({ where }),
      this.prisma.withdrawal.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: {
          vendor: {
            select: {
              id: true,
              canteenName: true,
              user: { select: { id: true, firstName: true, lastName: true, phone: true } },
            },
          },
          proof: { select: { id: true, originalName: true, contentType: true, sizeBytes: true, sha256: true, createdAt: true } },
          appeals: { orderBy: { createdAt: 'desc' }, take: 5 },
        },
      }),
    ]);
    return { data, meta: { page, limit, total, totalPages: Math.ceil(total / limit) } };
  }

  async findOneAdmin(id: string) {
    const withdrawal = await this.prisma.withdrawal.findUnique({
      where: { id, deletedAt: null },
      include: {
        vendor: {
          select: {
            id: true,
            canteenName: true,
            balanceFcfa: true,
            user: { select: { id: true, firstName: true, lastName: true, phone: true, email: true } },
          },
        },
        proof: { select: { id: true, originalName: true, contentType: true, sizeBytes: true, sha256: true, createdAt: true } },
        appeals: { orderBy: { createdAt: 'desc' } },
      },
    });
    if (!withdrawal) throw new NotFoundException('Retrait introuvable');
    return {
      ...withdrawal,
      manualTransfer: {
        grossAmountRequested: Number(withdrawal.amount),
        feeRetainedByKabakaba: Number(withdrawal.feeRetained),
        operatorCashFeeCoveredByKabakaba: Number(withdrawal.platformFee),
        totalDebitedFromVendor: Number(withdrawal.debitedAmount),
        netAmountToSend: Number(withdrawal.payoutAmount ?? withdrawal.amount),
        operator: withdrawal.operator,
        vendorPhone: withdrawal.vendor.user.phone,
      },
    };
  }

  private assertAdmin(actor: Actor) {
    if (actor.kind !== 'web' || actor.role !== WebUserRole.ADMIN) {
      throw new ForbiddenException('Action réservée aux administrateurs Web');
    }
  }

  async accept(id: string, actor: Actor) {
    this.assertAdmin(actor);
    const withdrawal = await this.prisma.withdrawal.findUnique({ where: { id, deletedAt: null } });
    if (!withdrawal) throw new NotFoundException('Retrait introuvable');
    if (withdrawal.status !== WithdrawalStatus.PENDING) {
      throw new ConflictException('Seul un retrait PENDING peut être accepté');
    }

    const updated = await this.prisma.$transaction(async (tx) => {
      const claim = await tx.withdrawal.updateMany({
        where: { id, status: WithdrawalStatus.PENDING, deletedAt: null },
        data: { status: WithdrawalStatus.PROCESSING, acceptedAt: new Date(), acceptedByWebUserId: actor.id },
      });
      if (claim.count !== 1) throw new ConflictException('Le retrait a déjà été traité par un autre administrateur');
      return tx.withdrawal.findUnique({ where: { id } });
    });

    const vendor = await this.prisma.vendor.findUnique({ where: { id: withdrawal.vendorId }, select: { userId: true } });
    if (vendor) {
      await this.notifications.notifyUser(
        vendor.userId,
        'Retrait accepté',
        `Votre demande de retrait de ${Number(withdrawal.amount)} FCFA a été acceptée. Le transfert manuel est en cours.`,
        NotificationType.INFO,
      );
    }
    await this.audit(actor.id, 'WITHDRAWAL_ACCEPTED', id, { status: WithdrawalStatus.PROCESSING });
    return updated;
  }

  async uploadProof(id: string, file: UploadedProofFile, actor: Actor) {
    this.assertAdmin(actor);
    if (!file?.buffer?.length) throw new BadRequestException('Preuve de transaction manquante');
    if (file.size > 5 * 1024 * 1024) throw new BadRequestException('La preuve ne doit pas dépasser 5 Mo');
    const contentType = this.detectImageType(file.buffer);
    if (!contentType) throw new BadRequestException('Format accepté : JPEG, PNG ou WebP uniquement');

    const withdrawal = await this.prisma.withdrawal.findUnique({ where: { id, deletedAt: null } });
    if (!withdrawal) throw new NotFoundException('Retrait introuvable');
    if (withdrawal.status !== WithdrawalStatus.PROCESSING) {
      throw new ConflictException('La preuve ne peut être ajoutée qu’à un retrait accepté et en cours');
    }

    const sha256 = crypto.createHash('sha256').update(file.buffer).digest('hex');
    // Prisma 7 types Bytes as Uint8Array<ArrayBuffer>; normalize Multer's Buffer type.
    const proofData = new Uint8Array(file.buffer) as unknown as Uint8Array<ArrayBuffer>;
    const proof = await this.prisma.withdrawalProof.upsert({
      where: { withdrawalId: id },
      create: {
        withdrawalId: id,
        uploadedByWebUserId: actor.id,
        originalName: String(file.originalname || 'preuve').slice(0, 255),
        contentType,
        sizeBytes: file.buffer.length,
        sha256,
        data: proofData,
      },
      update: {
        uploadedByWebUserId: actor.id,
        originalName: String(file.originalname || 'preuve').slice(0, 255),
        contentType,
        sizeBytes: file.buffer.length,
        sha256,
        data: proofData,
      },
      select: { id: true, originalName: true, contentType: true, sizeBytes: true, sha256: true, createdAt: true },
    });

    await this.audit(actor.id, 'WITHDRAWAL_PROOF_UPLOADED', id, {
      proofId: proof.id,
      sha256,
      sizeBytes: file.buffer.length,
      contentType,
    });
    return proof;
  }

  async getProof(id: string, actor: Actor) {
    this.assertAdmin(actor);
    const proof = await this.prisma.withdrawalProof.findUnique({ where: { withdrawalId: id } });
    if (!proof) throw new NotFoundException('Preuve de transaction introuvable');
    return proof;
  }

  async confirmManualPayment(id: string, actor: Actor) {
    this.assertAdmin(actor);
    const now = new Date();
    const deadline = new Date(now.getTime() + APPEAL_WINDOW_MS);

    const result = await this.prisma.$transaction(async (tx) => {
      const withdrawal = await tx.withdrawal.findUnique({ where: { id, deletedAt: null } });
      if (!withdrawal) throw new NotFoundException('Retrait introuvable');
      if (withdrawal.status !== WithdrawalStatus.PROCESSING) {
        throw new ConflictException('Seul un retrait accepté et en cours peut être validé');
      }
      const proof = await tx.withdrawalProof.findUnique({ where: { withdrawalId: id } });
      if (!proof) throw new BadRequestException('Ajoutez la preuve de transaction avant de valider le paiement');

      const updated = await tx.withdrawal.updateMany({
        where: { id, status: WithdrawalStatus.PROCESSING },
        data: {
          status: WithdrawalStatus.COMPLETED,
          paidAt: now,
          payoutCompletedAt: now,
          confirmationDeadlineAt: deadline,
        },
      });
      if (updated.count !== 1) throw new ConflictException('Le retrait a déjà été validé');
      await tx.transaction.updateMany({
        where: { reference: id, type: 'WITHDRAWAL' },
        data: { status: 'COMPLETED' },
      });
      return tx.withdrawal.findUnique({ where: { id } });
    });

    const vendor = await this.prisma.vendor.findUnique({ where: { id: result!.vendorId }, select: { userId: true } });
    if (vendor) {
      await this.notifications.notifyUser(
        vendor.userId,
        'Retrait envoyé',
        `Votre retrait de ${Number(result!.amount)} FCFA a été envoyé sur ${result!.operator === 'FLOOZ' ? 'Flooz' : 'Mixx'}. Si le montant est incorrect ou si vous ne l’avez pas reçu, signalez-le dans l’heure suivant cette notification.`,
        NotificationType.SUCCESS,
      );
    }
    await this.audit(actor.id, 'WITHDRAWAL_MANUAL_PAYMENT_CONFIRMED', id, {
      paidAt: now.toISOString(),
      confirmationDeadlineAt: deadline.toISOString(),
      amountToSend: Number(result!.payoutAmount ?? result!.amount),
      operator: result!.operator,
    });
    return result;
  }

  async cancel(id: string, reason: string, actor: Actor) {
    this.assertAdmin(actor);
    return this.failOrCancel(id, reason, WithdrawalStatus.CANCELLED, actor);
  }

  async fail(id: string, reason: string, actor: Actor) {
    this.assertAdmin(actor);
    return this.failOrCancel(id, reason, WithdrawalStatus.FAILED, actor);
  }

  private async failOrCancel(id: string, reason: string, target: 'FAILED' | 'CANCELLED', actor: Actor) {
    const result = await this.prisma.$transaction(async (tx) => {
      const existing = await tx.withdrawal.findUnique({ where: { id, deletedAt: null } });
      if (!existing) throw new NotFoundException('Retrait introuvable');
      if (existing.status === WithdrawalStatus.COMPLETED) throw new ConflictException('Impossible de modifier un retrait déjà payé');
      if (existing.status === WithdrawalStatus.FAILED || existing.status === WithdrawalStatus.CANCELLED) {
        throw new ConflictException('Ce retrait est déjà clôturé');
      }

      await tx.vendor.update({ where: { id: existing.vendorId }, data: { balanceFcfa: { increment: existing.debitedAmount } } });
      const vendor = await tx.vendor.findUnique({ where: { id: existing.vendorId }, select: { userId: true } });
      if (vendor) {
        await tx.transaction.create({
          data: {
            userId: vendor.userId,
            type: 'REFUND',
            status: 'COMPLETED',
            amount: existing.debitedAmount,
            reference: crypto.randomUUID(),
            description: `${target === WithdrawalStatus.CANCELLED ? 'Annulation' : 'Échec'} du retrait ${id} — solde recrédité.`,
          },
        });
        await tx.transaction.updateMany({ where: { reference: id, type: 'WITHDRAWAL' }, data: { status: 'FAILED' } });
      }

      const data: Prisma.WithdrawalUpdateInput = target === WithdrawalStatus.CANCELLED
        ? { status: target, cancelledAt: new Date(), cancelledByWebUser: { connect: { id: actor.id } }, cancellationReason: reason }
        : { status: target, failureReason: reason };
      return tx.withdrawal.update({ where: { id }, data });
    });

    const vendor = await this.prisma.vendor.findUnique({ where: { id: result.vendorId }, select: { userId: true } });
    if (vendor) {
      await this.notifications.notifyUser(
        vendor.userId,
        target === WithdrawalStatus.CANCELLED ? 'Retrait annulé' : 'Retrait non abouti',
        `${target === WithdrawalStatus.CANCELLED ? 'Votre retrait a été annulé' : "Votre retrait n'a pas abouti"}. Le montant débité (${Number(result.debitedAmount)} FCFA) a été recrédité sur votre solde. Motif : ${reason}`,
        target === WithdrawalStatus.CANCELLED ? NotificationType.WARNING : NotificationType.ERROR,
      );
    }
    await this.audit(actor.id, target === WithdrawalStatus.CANCELLED ? 'WITHDRAWAL_CANCELLED' : 'WITHDRAWAL_FAILED', id, { reason });
    return result;
  }

  async createAppeal(id: string, dto: CreateWithdrawalAppealDto, actor: Actor) {
    if (actor.role !== UserRole.VENDOR || actor.kind === 'web') {
      throw new ForbiddenException('Action réservée au vendeur concerné');
    }
    const withdrawal = await this.prisma.withdrawal.findUnique({ where: { id, deletedAt: null }, include: { vendor: true } });
    if (!withdrawal) throw new NotFoundException('Retrait introuvable');
    if (withdrawal.vendor.userId !== actor.id) throw new ForbiddenException('Vous ne pouvez contester que vos propres retraits');
    if (withdrawal.status !== WithdrawalStatus.COMPLETED || !withdrawal.confirmationDeadlineAt) {
      throw new ConflictException('Ce retrait ne peut plus être contesté');
    }
    if (withdrawal.autoConfirmedAt || withdrawal.confirmationDeadlineAt.getTime() <= Date.now()) {
      throw new ConflictException('Le délai d’une heure pour signaler un problème est écoulé');
    }

    const type = dto.type === WithdrawalAppealTypeDto.NOT_RECEIVED
      ? WithdrawalAppealType.NOT_RECEIVED
      : WithdrawalAppealType.AMOUNT_MISMATCH;

    const pending = await this.prisma.withdrawalAppeal.findFirst({ where: { withdrawalId: id, status: WithdrawalAppealStatus.PENDING } });
    if (pending) throw new ConflictException('Une contestation est déjà en cours pour ce retrait');

    const appeal = await this.prisma.withdrawalAppeal.create({
      data: { withdrawalId: id, type, reason: dto.reason },
    });
    await this.notifications.notifyUser(
      actor.id,
      'Signalement de retrait reçu',
      'Votre signalement a été transmis. Un administrateur va vérifier la transaction.',
      NotificationType.INFO,
    );
    return appeal;
  }

  async resolveAppeal(id: string, resolutionNote: string, approved: boolean, actor: Actor) {
    this.assertAdmin(actor);
    const appeal = await this.prisma.withdrawalAppeal.findUnique({ where: { id }, include: { withdrawal: true } });
    if (!appeal) throw new NotFoundException('Contestation introuvable');
    if (appeal.status !== WithdrawalAppealStatus.PENDING) throw new ConflictException('Cette contestation est déjà traitée');

    const updated = await this.prisma.withdrawalAppeal.update({
      where: { id },
      data: {
        status: approved ? WithdrawalAppealStatus.APPROVED : WithdrawalAppealStatus.REJECTED,
        resolutionNote,
        resolvedAt: new Date(),
        resolvedByWebUserId: actor.id,
      },
    });
    await this.audit(actor.id, approved ? 'WITHDRAWAL_APPEAL_APPROVED' : 'WITHDRAWAL_APPEAL_REJECTED', appeal.withdrawalId, {
      appealId: id,
      type: appeal.type,
      resolutionNote,
    });
    return updated;
  }

  async autoConfirmDue() {
    const due = await this.prisma.withdrawal.findMany({
      where: {
        status: WithdrawalStatus.COMPLETED,
        confirmationDeadlineAt: { lte: new Date() },
        autoConfirmedAt: null,
        deletedAt: null,
        appeals: { none: { status: WithdrawalAppealStatus.PENDING } },
      },
      select: { id: true, vendorId: true },
    });
    let confirmed = 0;
    for (const withdrawal of due) {
      const result = await this.prisma.withdrawal.updateMany({
        where: {
          id: withdrawal.id,
          status: WithdrawalStatus.COMPLETED,
          autoConfirmedAt: null,
          appeals: { none: { status: WithdrawalAppealStatus.PENDING } },
        },
        data: { autoConfirmedAt: new Date() },
      });
      if (result.count === 1) {
        confirmed++;
        const current = await this.prisma.withdrawal.findUnique({ where: { id: withdrawal.id }, select: { vendorId: true, amount: true } });
        if (current) {
          const vendor = await this.prisma.vendor.findUnique({ where: { id: current.vendorId }, select: { userId: true } });
          if (vendor) {
            await this.notifications.notifyUser(
              vendor.userId,
              'Retrait confirmé',
              `Le délai de signalement d’une heure pour votre retrait de ${Number(current.amount)} FCFA est écoulé. Le retrait est considéré comme reçu.`,
              NotificationType.SUCCESS,
            );
          }
        }
      }
    }
    return { found: due.length, confirmed };
  }

  private toRecap(fees: ReturnType<typeof computeWithdrawalFees>) {
    return {
      tier: fees.tier,
      operator: fees.operator,
      amountRequested: fees.amountRequested,
      fedapayFee: fees.fedapayFee,
      cashOutFee: fees.cashOutFee,
      payoutAmountToSend: fees.payoutAmountToSend,
      debitedFromBalance: fees.debitedFromBalance,
      vendorBorneFedapayFee: fees.vendorBorneFedapayFee,
      platformCost: fees.platformCost,
      lines: fees.summaryLines,
    };
  }

  private detectImageType(buffer: Buffer): 'image/jpeg' | 'image/png' | 'image/webp' | null {
    if (buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) return 'image/jpeg';
    if (buffer.length >= 8 && buffer.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return 'image/png';
    if (buffer.length >= 12 && buffer.subarray(0, 4).toString() === 'RIFF' && buffer.subarray(8, 12).toString() === 'WEBP') return 'image/webp';
    return null;
  }

  private async audit(webUserId: string, action: string, entityId: string, metadata: Record<string, unknown>) {
    await this.prisma.auditLog.create({
      data: {
        webUserId,
        action,
        entity: 'Withdrawal',
        entityId,
        metadata: metadata as Prisma.InputJsonValue,
      },
    });
  }
}
