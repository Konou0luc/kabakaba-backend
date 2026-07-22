import { ApiProperty } from '@nestjs/swagger';
import { BaseEntity } from '../../../common/entities/base.entity';
import { UserRole } from '@prisma/client';

export class UserEntity extends BaseEntity {
  @ApiProperty({ example: '+22890000000', required: false, description: 'Numéro de téléphone' })
  phone?: string;

  @ApiProperty({ example: 'student@univ.tg', required: false, description: 'Email' })
  email?: string;

  @ApiProperty({ example: 'Jean', description: 'Prénom' })
  firstName: string;

  @ApiProperty({ example: 'Dupont', description: 'Nom de famille' })
  lastName: string;

  @ApiProperty({ example: 'https://example.com/avatar.jpg', required: false, description: 'URL de l\'avatar' })
  avatarUrl?: string;

  @ApiProperty({ enum: UserRole, description: 'Rôle de l\'utilisateur' })
  role: UserRole;

  @ApiProperty({ example: 'uuid-campus', required: false, description: 'Identifiant du campus' })
  campusId?: string;

  @ApiProperty({ example: 1000, description: 'Solde du portefeuille en tickets' })
  walletBalance: number;

  @ApiProperty({ example: 0, description: 'Solde en séquestre en tickets' })
  escrowBalance: number;

  @ApiProperty({ description: 'Indique si l\'utilisateur est suspendu' })
  isSuspended: boolean;

  @ApiProperty({ required: false, description: 'Date de fin de la suspension' })
  suspensionUntil?: Date;

  @ApiProperty({ required: false, description: 'Motif de la suspension' })
  suspensionReason?: string;

  @ApiProperty({ default: false, description: 'Indique si l\'utilisateur doit changer son mot de passe à la prochaine connexion (compte créé avec un mot de passe temporaire)' })
  mustChangePassword: boolean;

  @ApiProperty({ default: true, description: 'Recevoir des notifications pour les commandes' })
  notifyOrders: boolean;

  @ApiProperty({ default: true, description: 'Recevoir des notifications pour le programme ambassadeur' })
  notifyAmbassador: boolean;

  @ApiProperty({ default: false, description: 'Recevoir des notifications pour les promotions' })
  notifyPromotions: boolean;
}
