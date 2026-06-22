import { ApiProperty } from '@nestjs/swagger';
import { IsPhoneNumber, IsNotEmpty } from 'class-validator';

export class SendOtpDto {
  @ApiProperty({ example: '+22890000000', description: 'Numéro de téléphone' })
  @IsPhoneNumber()
  @IsNotEmpty()
  phone: string;
}
