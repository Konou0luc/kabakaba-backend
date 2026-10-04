import { ApiProperty } from '@nestjs/swagger';
import { IsOptional, IsEnum, IsString, IsDateString } from 'class-validator';
import { AmbassadorLevel, AmbassadorStatus } from '@prisma/client';

export class UpdateAmbassadorDto {
  @ApiProperty({ example: 'KABA-LUC-24', required: false, description: 'Code promo unique (généré automatiquement à l\'approbation si absent)' })
  @IsOptional()
  @IsString()
  promoCode?: string;

  @ApiProperty({ enum: AmbassadorLevel, required: false, description: 'Niveau de l\'ambassadeur (BRONZE, SILVER, GOLD)' })
  @IsOptional()
  @IsEnum(AmbassadorLevel)
  level?: AmbassadorLevel;

  @ApiProperty({ enum: AmbassadorStatus, required: false, description: 'Décision : ACTIVE (approuvé), REJECTED, SUSPENDED' })
  @IsOptional()
  @IsEnum(AmbassadorStatus)
  status?: AmbassadorStatus;

  @ApiProperty({ required: false, description: 'Motif d\'approbation ou de rejet' })
  @IsOptional()
  @IsString()
  decisionReason?: string;

  @ApiProperty({ required: false, description: 'URL de la carte étudiante fournie en candidature' })
  @IsOptional()
  @IsString()
  schoolCardUrl?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  institution?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  faculty?: string;

  @ApiProperty({
    required: false,
    deprecated: true,
    description: 'Obsolète et ignoré : le serveur horodate lui-même la suspension. Accepté pour compatibilité avec les anciens clients.',
  })
  @IsOptional()
  @IsDateString()
  suspendedAt?: Date;
}
