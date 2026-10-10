import { ApiProperty } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsNotEmpty, IsString, MaxLength } from 'class-validator';

export class CancelOrderDto {
  @ApiProperty({
    maxLength: 500,
    description: 'Motif de l’annulation : obligatoire',
  })
  // Espaces de début et de fin retirés avant la validation : un motif d'espaces est vide.
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @IsNotEmpty()
  @MaxLength(500)
  reason: string;
}
