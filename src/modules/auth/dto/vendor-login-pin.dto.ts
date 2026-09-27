import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsPhoneNumber, IsString, Matches } from 'class-validator';
import { VENDOR_PIN_LENGTH } from '../constants/vendor-pin.constants';

export class VendorLoginPinDto {
  @ApiProperty({
    example: '+22890000000',
    description: 'Numéro de téléphone du compte vendeur',
  })
  @IsPhoneNumber()
  @IsNotEmpty()
  phone: string;

  @ApiProperty({
    example: '4821',
    description: `Code PIN à ${VENDOR_PIN_LENGTH} chiffres`,
  })
  @IsString()
  @Matches(new RegExp(`^\\d{${VENDOR_PIN_LENGTH}}$`), {
    message: `Le code PIN doit contenir exactement ${VENDOR_PIN_LENGTH} chiffres`,
  })
  pin: string;
}
