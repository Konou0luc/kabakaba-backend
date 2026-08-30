import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsPhoneNumber } from 'class-validator';

export class InitiatePaymentDto {
  @ApiProperty({
    example: '+22890123456',
    description: 'Numéro de téléphone Mobile Money — format international obligatoire (+228...)',
  })
  @IsNotEmpty()
  @IsPhoneNumber()
  phoneNumber: string;
}
