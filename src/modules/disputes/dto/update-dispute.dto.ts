import { ApiProperty } from '@nestjs/swagger';
import { IsEnum, IsOptional, IsString } from 'class-validator';
import { DisputeStatus, DisputeDecision } from '@prisma/client';

export class UpdateDisputeDto {
  @ApiProperty({ enum: DisputeStatus, required: false })
  @IsOptional()
  @IsEnum(DisputeStatus)
  status?: DisputeStatus;

  @ApiProperty({ enum: DisputeDecision, required: false })
  @IsOptional()
  @IsEnum(DisputeDecision)
  decision?: DisputeDecision;

  @ApiProperty({ required: false, description: 'Note de résolution rédigée par l\'équipe support' })
  @IsOptional()
  @IsString()
  decisionNote?: string;

  @ApiProperty({ required: false, description: 'Identifiant du WebUser ayant traité le litige' })
  @IsOptional()
  @IsString()
  treatedByWebUserId?: string;
}
