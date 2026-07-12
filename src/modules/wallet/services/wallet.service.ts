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

    // Récupérer l'expéditeur
    const sender = await this.prisma.user.findUnique({
      where: { id: senderId },
    });
    if (!sender) {
      throw new NotFoundException('Expéditeur introuvable');
    }

    // Vérifier le solde
    if (sender.walletBalance < amount) {
      throw new BadRequestException('Solde insuffisant');
    }

    // Récupérer le destinataire
    const recipient = await this.prisma.user.findUnique({
      where: { phone: recipientPhone },
    });
    if (!recipient) {
      throw new NotFoundException('Destinataire introuvable');
    }

    if (senderId === recipient.id) {
      throw new BadRequestException('Vous ne pouvez pas envoyer de l\'argent à vous-même');
    }

    // Générer une référence unique
    const reference = crypto.randomUUID();

    // Utiliser une transaction Prisma pour assurer l'atomicité
    await this.prisma.$transaction([
      // Débiter l'expéditeur
      this.prisma.user.update({
        where: { id: senderId },
        data: {
          walletBalance: {
            decrement: amount,
          },
        },
      }),
      // Créditer le destinataire
      this.prisma.user.update({
        where: { id: recipient.id },
        data: {
          walletBalance: {
            increment: amount,
          },
        },
      }),
      // Créer la transaction pour l'expéditeur
      this.prisma.transaction.create({
        data: {
          type: TransactionType.TRANSFER,
          amount,
          reference,
          description: `Envoi à ${recipient.firstName} ${recipient.lastName}`,
          userId: senderId,
          senderId,
          receiverId: recipient.id,
        },
      }),
      // Créer la transaction pour le destinataire
      this.prisma.transaction.create({
        data: {
          type: TransactionType.TRANSFER,
          amount,
          reference,
          description: `Réception de ${sender.firstName} ${sender.lastName}`,
          userId: recipient.id,
          senderId,
          receiverId: recipient.id,
        },
      }),
    ]);

    return {
      success: true,
      message: 'Argent envoyé avec succès',
      reference,
      amount,
    };
  }
}
