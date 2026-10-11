import { ApiProperty } from '@nestjs/swagger';
import { ReportType } from '@prisma/client';
import { Transform } from 'class-transformer';
import { IsEnum, IsNotEmpty, IsString, MaxLength, ValidateIf } from 'class-validator';

export class CreateReportDto {
  @ApiProperty({ example: 'order-uuid', description: 'Commande concernée par le signalement' })
  @IsNotEmpty()
  @IsString()
  orderId: string;

  @ApiProperty({
    enum: ReportType,
    example: ReportType.MISSING_COMPONENT,
    description: 'Nature du problème : mauvais repas, composant manquant, commande incomplète ou autre',
  })
  @IsEnum(ReportType, { message: 'Le type de signalement est invalide' })
  type: ReportType;

  @ApiProperty({
    required: false,
    maxLength: 500,
    example: 'Il manquait le poisson dans mon assiette',
    description: 'Commentaire (500 caractères maximum), obligatoire si le type est OTHER',
  })
  // Espaces de début et de fin retirés ; un champ vide ou null équivaut à un champ absent.
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() || undefined : (value ?? undefined)))
  // Validé seulement s'il est renseigné, ou obligatoire quand le type est OTHER.
  @ValidateIf((report: CreateReportDto) => report.type === ReportType.OTHER || report.comment !== undefined)
  @IsNotEmpty({ message: 'Un commentaire est obligatoire pour signaler un autre problème' })
  @IsString({ message: 'Le commentaire doit être un texte' })
  @MaxLength(500, { message: 'Le commentaire ne peut pas dépasser 500 caractères' })
  comment?: string;
}
