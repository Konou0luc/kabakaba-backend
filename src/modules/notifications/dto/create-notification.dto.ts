import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString, IsEnum, IsOptional, IsBoolean } from 'class-validator';
import { NotificationType } from '@prisma/client';

export class CreateNotificationDto {
  @ApiProperty({ example: 'user-uuid' })
  @IsNotEmpty()
  @IsString()
  userId: string;

  @ApiProperty({ example: 'Votre commande est prête!' })
  @IsNotEmpty()
  @IsString()
  title: string;

  @ApiProperty({ example: 'Venez récupérer votre commande à la cafétéria.' })
  @IsNotEmpty()
  @IsString()
  message: string;

  @ApiProperty({ enum: NotificationType, required: false })
  @IsOptional()
  @IsEnum(NotificationType)
  type?: NotificationType;
}
