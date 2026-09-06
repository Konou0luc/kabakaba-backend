import { ApiProperty } from '@nestjs/swagger';
import { IsEnum, IsOptional } from 'class-validator';
import { PartnerApplicationStatus } from '@prisma/client';

export class UpdatePartnerApplicationDto {
  @ApiProperty({ enum: PartnerApplicationStatus, required: false })
  @IsOptional()
  @IsEnum(PartnerApplicationStatus)
  status?: PartnerApplicationStatus;
}
