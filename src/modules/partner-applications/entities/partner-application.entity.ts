import { ApiProperty } from '@nestjs/swagger';
import { PartnerApplicationStatus } from '@prisma/client';

export class PartnerApplicationEntity {
  @ApiProperty({ example: '550e8400-e29b-41d4-a716-446655440000' })
  id: string;

  @ApiProperty({ example: 'Restaurant Chez Awa' })
  structureName: string;

  @ApiProperty({ example: 'Awa Diallo' })
  contactName: string;

  @ApiProperty({ example: '+22890000000' })
  phone: string;

  @ApiProperty({ example: 'awa@chezawa.tg' })
  email: string;

  @ApiProperty({ example: 'Campus Lomé Nord' })
  targetCampus: string;

  @ApiProperty({ required: false })
  message?: string;

  @ApiProperty({ enum: PartnerApplicationStatus, default: PartnerApplicationStatus.NEW })
  status: PartnerApplicationStatus;

  @ApiProperty({ required: false, description: 'Identifiant du WebUser ayant traité la candidature' })
  treatedByWebUserId?: string;

  @ApiProperty()
  createdAt: Date;

  @ApiProperty()
  updatedAt: Date;
}
