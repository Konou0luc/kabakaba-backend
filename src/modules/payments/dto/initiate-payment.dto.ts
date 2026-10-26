import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, Matches } from 'class-validator';

/**
 * Flooz et Mixx : E.164 `+228XXXXXXXX` ou 8 chiffres nationaux.
 * Le service normalise les deux de la même façon pour le push FedaPay.
 */
export class InitiatePaymentDto {
  @ApiProperty({
    example: '+22890123456',
    description:
      'Numéro Mobile Money, identique pour Flooz et Mixx : +228… ou 8 chiffres.',
  })
  @IsNotEmpty()
  @Matches(/^(\+?228)?[0-9]{8}$/, {
    message:
      'Numéro invalide. Utilise 8 chiffres (ex. 70341309) ou +228… (ex. +22870341309).',
  })
  phoneNumber: string;
}
