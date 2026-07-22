import { ApiProperty } from '@nestjs/swagger';
import { IsEnum, IsOptional, IsString } from 'class-validator';
import { PartnerApplicationStatus } from '@prisma/client';

export class UpdatePartnerApplicationDto {
  @ApiProperty({ enum: PartnerApplicationStatus, required: false })
  @IsOptional()
  @IsEnum(PartnerApplicationStatus)
  status?: PartnerApplicationStatus;

  @ApiProperty({ required: false, description: 'Identifiant du WebUser ayant traité la candidature' })
  @IsOptional()
  @IsString()
  treatedByWebUserId?: string;
}
