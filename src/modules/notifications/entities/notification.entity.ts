import { ApiProperty } from '@nestjs/swagger';
import { BaseEntity } from '../../../common/entities/base.entity';
import { NotificationType } from '@prisma/client';

export class NotificationEntity extends BaseEntity {
  @ApiProperty({ example: 'user-uuid' })
  userId: string;

  @ApiProperty({ example: 'Votre commande est prête!' })
  title: string;

  @ApiProperty({ example: 'Venez récupérer votre commande à la cafétéria.' })
  message: string;

  @ApiProperty({ enum: NotificationType })
  type: NotificationType;

  @ApiProperty({ example: false })
  isRead: boolean;
}
