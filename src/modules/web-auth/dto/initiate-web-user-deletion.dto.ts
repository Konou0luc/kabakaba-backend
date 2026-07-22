import { ApiProperty } from '@nestjs/swagger';
import { IsOptional, IsString } from 'class-validator';

export class InitiateWebUserDeletionDto {
  @ApiProperty({ example: 'Départ de l\'équipe', required: false })
  @IsOptional()
  @IsString()
  reason?: string;
}
