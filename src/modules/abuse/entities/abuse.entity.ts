import { ApiProperty } from '@nestjs/swagger';
import { BaseEntity } from '../../../common/entities/base.entity';

export class AbuseEntity extends BaseEntity {
  @ApiProperty({ example: 'student-uuid', description: 'Identifiant de l\'étudiant' })
  studentId: string;

  @ApiProperty({ example: 3, description: 'Nombre d\'abus' })
  count: number;

  @ApiProperty({ type: String, format: 'date-time', description: 'Début de la fenêtre de surveillance' })
  windowStart: Date;

  @ApiProperty({ example: false, description: 'Si un avertissement a été envoyé' })
  warningSent: boolean;
}
