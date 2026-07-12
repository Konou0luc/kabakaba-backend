import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString } from 'class-validator';

export class InitiatePaymentDto {
  @ApiProperty({
    example: '+22890123456',
    description: 'Numéro de téléphone Mobile Money',
  })
  @IsNotEmpty()
  @IsString()
  phoneNumber: string;
}
