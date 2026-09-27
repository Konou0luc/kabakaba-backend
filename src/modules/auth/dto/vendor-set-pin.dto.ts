import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString, Matches } from 'class-validator';
import { VENDOR_PIN_LENGTH } from '../constants/vendor-pin.constants';

export class VendorSetPinDto {
  @ApiProperty({
    description:
      "Jeton d'étape renvoyé par POST /auth/vendor/activate/verify-otp",
  })
  @IsString()
  @IsNotEmpty()
  pinSetupToken!: string;

  @ApiProperty({
    example: '4821',
    description: `Code PIN à ${VENDOR_PIN_LENGTH} chiffres`,
  })
  @IsString()
  @Matches(new RegExp(`^\\d{${VENDOR_PIN_LENGTH}}$`), {
    message: `Le code PIN doit contenir exactement ${VENDOR_PIN_LENGTH} chiffres`,
  })
  pin!: string;
}
