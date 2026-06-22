import { ApiProperty } from '@nestjs/swagger';
import { BaseEntity } from '../../../common/entities/base.entity';

export class ReviewEntity extends BaseEntity {
  @ApiProperty({ example: 'order-uuid', description: 'Identifiant de la commande' })
  orderId: string;

  @ApiProperty({ example: 'student-uuid', description: 'Identifiant de l\'étudiant' })
  studentId: string;

  @ApiProperty({ example: 'vendor-uuid', description: 'Identifiant du vendeur' })
  vendorId: string;

  @ApiProperty({ example: 5, description: 'Note de 1 à 5' })
  rating: number;

  @ApiProperty({ example: 'Excellent service !', required: false, description: 'Commentaire de l\'avis' })
  comment?: string;
}
