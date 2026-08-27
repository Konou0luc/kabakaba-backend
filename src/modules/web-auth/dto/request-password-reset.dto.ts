import { ApiProperty } from '@nestjs/swagger';
import { IsEmail, IsNotEmpty } from 'class-validator';

export class RequestPasswordResetDto {
  @ApiProperty({ example: 'directeur@kabakaba.app' })
  @IsNotEmpty()
  @IsEmail()
  email: string;
}
