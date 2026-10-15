import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsOptional, IsString, MaxLength } from 'class-validator';

export class CancelOrderDto {
  @ApiPropertyOptional({
    maxLength: 500,
    description:
      'Motif de l’annulation. Obligatoire pour la vendeuse (CDC §33) ; optionnel pour l’étudiant.',
  })
  // Espaces retirés ; une chaîne vide devient undefined (motif absent).
  @Transform(({ value }) => {
    if (typeof value !== 'string') return value;
    const trimmed = value.trim();
    return trimmed === '' ? undefined : trimmed;
  })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  reason?: string;
}
