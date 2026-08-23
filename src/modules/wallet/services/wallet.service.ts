import { Injectable, BadRequestException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../../database/services/prisma.service';
import { SendMoneyDto } from '../dto/send-money.dto';
import { TransactionType } from '@prisma/client';
import * as crypto from 'crypto';

@Injectable()
export class WalletService {
  constructor(private readonly prisma: PrismaService) {}

  async sendMoney(senderId: string, sendMoneyDto: SendMoneyDto) {
    const { recipientPhone, amount } = sendMoneyDto;

    return this.prisma.$transaction(async (tx) => {
      const sender = await tx.user.findUnique({
        where: { id: senderId },
      });
      if (!sender) {
        throw new NotFoundException('Expéditeur introuvable');
      }

      const recipient = await tx.user.findUnique({
        where: { phone: recipientPhone },
      });
      if (!recipient) {
        throw new NotFoundException('Destinataire introuvable');
      }

      if (senderId === recipient.id) {
        throw new BadRequestException('Vous ne pouvez pas envoyer de l\'argent à vous-même');
      }

      const reference = crypto.randomUUID();

      // Débit conditionnel atomique : la clause `walletBalance: { gte: amount }`
      // fait partie du WHERE de l'UPDATE lui-même, exécuté et vérifié par
      // Postgres sous le verrou de ligne qu'il pose sur cette ligne. Deux
      // requêtes sendMoney concurrentes pour le même expéditeur s'exécutent
      // donc en série au niveau base : la seconde relit le solde déjà débité
      // par la première avant de décider si elle peut aboutir. Contrairement
      // à une lecture préalable suivie d'un update séparé, il ne peut donc
      // pas y avoir de fenêtre où deux débits passent tous les deux la
      // vérification sur le même solde initial (double dépense).
      const debit = await tx.user.updateMany({
        where: { id: senderId, walletBalance: { gte: amount } },
        data: {
          walletBalance: {
            decrement: amount,
          },
        },
      });

      if (debit.count === 0) {
        throw new BadRequestException('Solde insuffisant');
      }

      await tx.user.update({
        where: { id: recipient.id },
        data: {
          walletBalance: {
            increment: amount,
          },
        },
      });

      await tx.transaction.create({
        data: {
          type: TransactionType.TRANSFER,
          amount,
          reference,
          description: `Envoi à ${recipient.firstName} ${recipient.lastName}`,
          userId: senderId,
          senderId,
          receiverId: recipient.id,
        },
      });

      await tx.transaction.create({
        data: {
          type: TransactionType.TRANSFER,
          amount,
          reference,
          description: `Réception de ${sender.firstName} ${sender.lastName}`,
          userId: recipient.id,
          senderId,
          receiverId: recipient.id,
        },
      });

      return {
        success: true,
        message: 'Argent envoyé avec succès',
        reference,
        amount,
      };
    });
  }
}
