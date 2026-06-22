import { ApiProperty } from '@nestjs/swagger';
import { BaseEntity } from '../../../common/entities/base.entity';

export class AuditLogEntity extends BaseEntity {
  @ApiProperty({ example: 'user-uuid' })
  adminId: string;

  @ApiProperty({ example: 'CREATE_USER' })
  action: string;

  @ApiProperty({ example: 'User' })
  entity: string;

  @ApiProperty({ example: 'entity-uuid' })
  entityId: string;

  @ApiProperty({ required: false, example: { firstName: 'John' } })
  metadata?: any;
}
