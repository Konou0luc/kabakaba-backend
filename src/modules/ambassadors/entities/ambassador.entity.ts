import { ApiProperty } from '@nestjs/swagger';
import { BaseEntity } from '../../../common/entities/base.entity';
import { AmbassadorLevel, AmbassadorStatus } from '@prisma/client';

export class AmbassadorEntity extends BaseEntity {
  @ApiProperty({ example: 'user-uuid', description: 'Identifiant de l\'utilisateur' })
  userId: string;

  @ApiProperty({ example: 'KABA-LUC-24', required: false, description: 'Code promo unique, attribué à l\'approbation' })
  promoCode?: string;

  @ApiProperty({ enum: AmbassadorLevel, description: 'Niveau de l\'ambassadeur (BRONZE, SILVER, GOLD)' })
  level: AmbassadorLevel;

  @ApiProperty({ enum: AmbassadorStatus, default: AmbassadorStatus.PENDING, description: 'Statut de la candidature/du compte' })
  status: AmbassadorStatus;

  @ApiProperty({ required: false, description: 'URL de la carte étudiante fournie en candidature' })
  schoolCardUrl?: string;

  @ApiProperty({ required: false })
  institution?: string;

  @ApiProperty({ required: false })
  faculty?: string;

  @ApiProperty({ example: 0, description: 'Volume de parrainages sur les 30 derniers jours' })
  volume30d: number;

  @ApiProperty({ required: false, nullable: true })
  lastReferralAt?: Date;

  @ApiProperty({ required: false, nullable: true, description: 'Date de suspension du compte ambassadeur' })
  suspendedAt?: Date;

  @ApiProperty({ required: false, description: 'Identifiant du WebUser ayant traité la candidature' })
  treatedByWebUserId?: string;

  @ApiProperty({ required: false, description: 'Motif d\'approbation ou de rejet' })
  decisionReason?: string;
}
