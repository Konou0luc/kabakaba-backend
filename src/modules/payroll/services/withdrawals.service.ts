import { BadRequestException, ForbiddenException, Injectable, NotFoundException, Logger } from '@nestjs/common';
import { WithdrawalStatus } from '@prisma/client';
import { PrismaService } from '../../../database/services/prisma.service';
import { FedapayService } from '../../payments/services/fedapay.service';

@Injectable()
export class WithdrawalsService {
  private readonly logger = new Logger(WithdrawalsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly fedapayService: FedapayService,
  ) {}

  async request(webUserId: string, amount: number, payoutNumber: string) {
    const webUser = await this.prisma.webUser.findUnique({ where: { id: webUserId } });
    if (!webUser) throw new NotFoundException();

    if (Number(webUser.balance) < amount) {
      throw new BadRequestException('Solde insuffisant pour ce retrait');
    }

    return this.prisma.$transaction(async (tx) => {
      await tx.webUser.update({ where: { id: webUserId }, data: { balance: { decrement: amount } } });
      return tx.webUserWithdrawalRequest.create({
        data: { webUserId, amount, payoutNumber },
      });
    });
  }

  async listAll() {
    return this.prisma.webUserWithdrawalRequest.findMany({
      orderBy: { requestedAt: 'desc' },
      include: {
        webUser: { select: { firstName: true, lastName: true, email: true } },
        processedBy: { select: { firstName: true, lastName: true } },
      },
    });
  }

  async listOwn(webUserId: string) {
    return this.prisma.webUserWithdrawalRequest.findMany({
      where: { webUserId },
      orderBy: { requestedAt: 'desc' },
    });
  }

  /**
   * Validation par un compte Supervision : déclenche immédiatement le
   * payout FedaPay réel (création + envoi).
   */
  async approve(requestId: string, approverId: string) {
    const request = await this.prisma.webUserWithdrawalRequest.findUnique({
      where: { id: requestId },
      include: { webUser: true },
    });
    if (!request) throw new NotFoundException();
    if (request.status !== WithdrawalStatus.PENDING) {
      throw new BadRequestException(`Cette demande a déjà été traitée (${request.status})`);
    }

    const merchantReference = `PAYROLL-${request.id}`;
    const payoutResponse = await this.fedapayService.createPayout(
      Number(request.amount),
      {
        name: `${request.webUser.firstName} ${request.webUser.lastName}`,
        phoneNumber: request.payoutNumber,
      },
      `Paie kabakaba — ${request.webUser.firstName} ${request.webUser.lastName}`,
      merchantReference,
    );

    const payoutId = payoutResponse?.payout?.id;
    if (!payoutId) {
      throw new BadRequestException('FedaPay n\'a pas renvoyé d\'identifiant de payout');
    }

    await this.fedapayService.sendPayoutNow(String(payoutId));

    return this.prisma.webUserWithdrawalRequest.update({
      where: { id: requestId },
      data: {
        status: WithdrawalStatus.PENDING, // reste PENDING jusqu'à confirmation webhook/poll — voir handleFedapayPayoutStatus
        fedapayPayoutId: String(payoutId),
        processedById: approverId,
        processedAt: new Date(),
      },
    });
  }

  async reject(requestId: string, approverId: string, reason: string) {
    const request = await this.prisma.webUserWithdrawalRequest.findUnique({ where: { id: requestId } });
    if (!request) throw new NotFoundException();
    if (request.status !== WithdrawalStatus.PENDING) {
      throw new BadRequestException(`Cette demande a déjà été traitée (${request.status})`);
    }

    return this.prisma.$transaction(async (tx) => {
      await tx.webUser.update({ where: { id: request.webUserId }, data: { balance: { increment: request.amount } } });
      return tx.webUserWithdrawalRequest.update({
        where: { id: requestId },
        data: { status: WithdrawalStatus.FAILED, rejectionReason: reason, processedById: approverId, processedAt: new Date() },
      });
    });
  }

  /**
   * Appelé par le webhook FedaPay (format non garanti à 100% — à confirmer
   * en sandbox) et par un mécanisme de secours par sondage si besoin.
   */
  async handleFedapayPayoutStatus(fedapayPayoutId: string, status: 'sent' | 'failed') {
    const request = await this.prisma.webUserWithdrawalRequest.findFirst({
      where: { fedapayPayoutId },
    });
    if (!request) {
      this.logger.warn(`Webhook payout reçu pour un id inconnu: ${fedapayPayoutId}`);
      return;
    }

    if (status === 'sent') {
      await this.prisma.webUserWithdrawalRequest.update({
        where: { id: request.id },
        data: { status: WithdrawalStatus.COMPLETED },
      });
    } else {
      // Échec réel côté FedaPay après envoi : on rembourse le solde.
      await this.prisma.$transaction([
        this.prisma.webUser.update({ where: { id: request.webUserId }, data: { balance: { increment: request.amount } } }),
        this.prisma.webUserWithdrawalRequest.update({
          where: { id: request.id },
          data: { status: WithdrawalStatus.FAILED, rejectionReason: 'Échec du transfert FedaPay' },
        }),
      ]);
    }
  }
}