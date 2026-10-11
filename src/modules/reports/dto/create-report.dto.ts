import { ApiProperty } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsEnum, IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';
import { ReportType } from '@prisma/client';

export class CreateReportDto {
  @ApiProperty({ example: 'order-uuid', description: 'Commande concernée (la sienne, prête ou récupérée)' })
  @IsNotEmpty()
  @IsString()
  orderId: string;

  @ApiProperty({
    enum: ReportType,
    example: ReportType.WRONG_MEAL,
    description: 'WRONG_MEAL (mauvais repas), MISSING_COMPONENT (composant manquant), INCOMPLETE_ORDER (commande incomplète), OTHER (autre problème)',
  })
  @IsEnum(ReportType)
  type: ReportType;

  @ApiProperty({
    example: "Il manquait la sauce dans mon repas",
    required: false,
    maxLength: 500,
    description: 'Précision facultative (500 caractères maximum), obligatoire quand type vaut OTHER',
  })
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsOptional()
  @IsString()
  @MaxLength(500)
  comment?: string;
}
