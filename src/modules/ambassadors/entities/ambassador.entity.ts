import { ApiProperty } from '@nestjs/swagger';
import { BaseEntity } from '../../../common/entities/base.entity';
import { AmbassadorLevel } from '@prisma/client';

export class AmbassadorEntity extends BaseEntity {
  @ApiProperty({ example: 'user-uuid', description: 'Identifiant de l\'utilisateur' })
  userId: string;

  @ApiProperty({ enum: AmbassadorLevel, description: 'Niveau de l\'ambassadeur (BRONZE, SILVER, GOLD)' })
  level: AmbassadorLevel;
}
