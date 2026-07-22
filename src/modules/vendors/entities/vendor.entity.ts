import { ApiProperty } from '@nestjs/swagger';
import { BaseEntity } from '../../../common/entities/base.entity';

export class VendorEntity extends BaseEntity {
  @ApiProperty({ example: 'user-uuid' })
  userId: string;

  @ApiProperty({ example: 'Restaurant Universitaire Paris' })
  canteenName: string;

  @ApiProperty({ example: 'https://logo.com/vendeur.jpg', required: false })
  logoUrl?: string;

  @ApiProperty({ example: 'https://logo.com/banniere.jpg', required: false, description: 'Bannière affichée sur la fiche cantine' })
  bannerUrl?: string;

  @ApiProperty({ example: 'Restaurant universitaire spécialisé dans la cuisine traditionnelle', required: false })
  description?: string;

  @ApiProperty({ example: 1500.50 })
  balanceFcfa: number;

  @ApiProperty({ example: 0 })
  debtFcfa: number;

  @ApiProperty({ example: true })
  isActive: boolean;

  @ApiProperty({ example: false })
  isOpen: boolean;
}
