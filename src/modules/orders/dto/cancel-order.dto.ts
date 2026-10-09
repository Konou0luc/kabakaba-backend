import { ApiProperty } from '@nestjs/swagger';
import { IsOptional, IsString, MaxLength } from 'class-validator';

export class CancelOrderDto {
  @ApiProperty({
    required: false,
    maxLength: 500,
    description: 'Motif de l’annulation : obligatoire pour la vendeuse, facultatif pour l’étudiant',
  })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  reason?: string;
}
