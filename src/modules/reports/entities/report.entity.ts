import { ApiProperty } from '@nestjs/swagger';
import { ReportStatus, ReportType } from '@prisma/client';

export class ReportEntity {
  @ApiProperty({ example: '550e8400-e29b-41d4-a716-446655440000' })
  id: string;

  @ApiProperty({ example: 'order-uuid' })
  orderId: string;

  @ApiProperty({ example: 'student-uuid' })
  studentId: string;

  @ApiProperty({ example: 'vendor-uuid' })
  vendorId: string;

  @ApiProperty({ enum: ReportType, example: ReportType.MISSING_COMPONENT })
  type: ReportType;

  @ApiProperty({ example: 'Il manquait la sauce', required: false, nullable: true, description: '500 caractères maximum ; obligatoire quand type vaut OTHER' })
  comment?: string | null;

  @ApiProperty({ enum: ReportStatus, default: ReportStatus.OPEN })
  status: ReportStatus;

  @ApiProperty({ required: false, nullable: true, description: 'Identifiant du WebUser ayant traité le signalement' })
  treatedByWebUserId?: string | null;

  @ApiProperty()
  createdAt: Date;

  @ApiProperty({ required: false, nullable: true })
  resolvedAt?: Date | null;
}
