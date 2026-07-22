import { ApiProperty } from '@nestjs/swagger';
import { IsEmail, IsNotEmpty, IsOptional, IsPhoneNumber, IsString } from 'class-validator';

export class CreatePartnerApplicationDto {
  @ApiProperty({ example: 'Restaurant Chez Awa' })
  @IsNotEmpty()
  @IsString()
  structureName: string;

  @ApiProperty({ example: 'Awa Diallo' })
  @IsNotEmpty()
  @IsString()
  contactName: string;

  @ApiProperty({ example: '+22890000000' })
  @IsNotEmpty()
  @IsPhoneNumber()
  phone: string;

  @ApiProperty({ example: 'awa@chezawa.tg' })
  @IsNotEmpty()
  @IsEmail()
  email: string;

  @ApiProperty({ example: 'Campus Lomé Nord' })
  @IsNotEmpty()
  @IsString()
  targetCampus: string;

  @ApiProperty({ example: 'Nous servons déjà 3 campus voisins', required: false })
  @IsOptional()
  @IsString()
  message?: string;
}
