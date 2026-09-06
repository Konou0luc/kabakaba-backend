import { ApiProperty } from '@nestjs/swagger';
import { IsBoolean, IsOptional } from 'class-validator';

export class UpdateNotificationDto {
  @ApiProperty({ example: true, required: false })
  @IsOptional()
  @IsBoolean()
  isRead?: boolean;
}
