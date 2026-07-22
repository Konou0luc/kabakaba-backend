import { ApiProperty } from '@nestjs/swagger';
import { WebUserRole } from '@prisma/client';

export class WebUserEntity {
  @ApiProperty()
  id: string;

  @ApiProperty()
  firstName: string;

  @ApiProperty()
  lastName: string;

  @ApiProperty()
  email: string;

  @ApiProperty({ enum: WebUserRole })
  role: WebUserRole;

  @ApiProperty({ required: false })
  phone?: string;

  @ApiProperty({ required: false })
  avatarInitials?: string;

  @ApiProperty({ required: false })
  avatarColor?: string;

  @ApiProperty()
  isActive: boolean;

  @ApiProperty({ description: 'Compte protégé — ne peut jamais être supprimé' })
  isRoot: boolean;

  @ApiProperty()
  twoFaEnabled: boolean;

  @ApiProperty({ required: false, nullable: true })
  lastLoginAt?: Date;

  @ApiProperty()
  createdAt: Date;
}
