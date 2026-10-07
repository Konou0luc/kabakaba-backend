import { ApiProperty } from '@nestjs/swagger';
import { IsEnum, IsOptional, IsString } from 'class-validator';
import { DisputeStatus } from '@prisma/client';

export class UpdateDisputeDto {
  @ApiProperty({ enum: DisputeStatus, required: false })
  @IsOptional()
  @IsEnum(DisputeStatus)
  status?: DisputeStatus;

  @ApiProperty({ required: false, description: 'Identifiant du WebUser ayant traité le litige' })
  @IsOptional()
  @IsString()
  treatedByWebUserId?: string;
}
