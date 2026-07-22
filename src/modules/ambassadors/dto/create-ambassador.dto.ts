import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString, IsEnum, IsOptional } from 'class-validator';
import { AmbassadorLevel, AmbassadorStatus } from '@prisma/client';

export class CreateAmbassadorDto {
  @ApiProperty({ example: 'user-uuid', description: 'Identifiant de l\'utilisateur' })
  @IsNotEmpty()
  @IsString()
  userId: string;

  @ApiProperty({ example: 'KABA-LUC-24', required: false, description: 'Code promo unique (peut être attribué plus tard, à l\'approbation)' })
  @IsOptional()
  @IsString()
  promoCode?: string;

  @ApiProperty({ enum: AmbassadorLevel, required: false, description: 'Niveau de l\'ambassadeur (BRONZE, SILVER, GOLD)' })
  @IsOptional()
  @IsEnum(AmbassadorLevel)
  level?: AmbassadorLevel;

  @ApiProperty({
    enum: AmbassadorStatus,
    required: false,
    description:
      'Statut du compte. Par défaut PENDING (candidature en attente) — passer ACTIVE explicitement pour créer un ambassadeur déjà actif.',
  })
  @IsOptional()
  @IsEnum(AmbassadorStatus)
  status?: AmbassadorStatus;

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
}
