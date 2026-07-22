import { ApiProperty, PartialType } from '@nestjs/swagger';
import { IsBoolean, IsDateString, IsOptional, IsString } from 'class-validator';
import { CreateUserDto } from './create-user.dto';

export class UpdateUserDto extends PartialType(CreateUserDto) {
  @ApiProperty({ required: false, description: 'Indique si l\'utilisateur est suspendu' })
  @IsOptional()
  @IsBoolean()
  isSuspended?: boolean;

  @ApiProperty({ required: false, description: 'Date de fin de la suspension' })
  @IsOptional()
  @IsDateString()
  suspensionUntil?: Date;

  @ApiProperty({ required: false, description: 'Motif de la suspension (ex : abus signalés, annulations répétées)' })
  @IsOptional()
  @IsString()
  suspensionReason?: string;
}
