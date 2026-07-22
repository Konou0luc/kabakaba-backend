import { ApiProperty, PartialType } from '@nestjs/swagger';
import { CreateAmbassadorDto } from './create-ambassador.dto';
import { IsOptional, IsEnum, IsString, IsDateString } from 'class-validator';
import { AmbassadorLevel, AmbassadorStatus } from '@prisma/client';

export class UpdateAmbassadorDto extends PartialType(CreateAmbassadorDto) {
  @ApiProperty({ enum: AmbassadorLevel, required: false })
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

  @ApiProperty({ required: false, description: 'Identifiant du WebUser ayant traité la candidature' })
  @IsOptional()
  @IsString()
  treatedByWebUserId?: string;

  @ApiProperty({ required: false, description: 'Date de suspension (à renseigner si status=SUSPENDED)' })
  @IsOptional()
  @IsDateString()
  suspendedAt?: Date;
}
