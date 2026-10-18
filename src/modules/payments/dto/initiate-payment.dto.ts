import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, Matches } from 'class-validator';

/**
 * Flooz : préférer E.164 `+228XXXXXXXX`
 * Mixx  : national `XXXXXXXX` (FedaPay togocel)
 * Les deux formes sont acceptées ; le service normalise pour FedaPay.
 */
export class InitiatePaymentDto {
  @ApiProperty({
    example: '+22890123456',
    description:
      'Numéro Mobile Money. Flooz: +228… ; Mixx: 8 chiffres nationaux (sans 228).',
  })
  @IsNotEmpty()
  @Matches(/^(\+?228)?[0-9]{8}$/, {
    message:
      'Numéro invalide. Utilise 8 chiffres (ex. 70341309) ou +228… (ex. +22870341309).',
  })
  phoneNumber: string;
}
