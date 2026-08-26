import { ApiProperty } from '@nestjs/swagger';
import { BaseEntity } from '../../../common/entities/base.entity';

export class CampusEntity extends BaseEntity {
  @ApiProperty({ example: 'Campus Paris' })
  name: string;

  @ApiProperty({ example: 'Paris' })
  city: string;

  @ApiProperty({ example: 'Université Paris 1' })
  institution: string;

  @ApiProperty({ example: true })
  isActive: boolean;
}
