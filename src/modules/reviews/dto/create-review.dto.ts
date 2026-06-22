import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString, IsInt, Min, Max, IsOptional } from 'class-validator';

export class CreateReviewDto {
  @ApiProperty({ example: 'order-uuid', description: 'Identifiant de la commande' })
  @IsNotEmpty()
  @IsString()
  orderId: string;

  @ApiProperty({ example: 'vendor-uuid', description: 'Identifiant du vendeur' })
  @IsNotEmpty()
  @IsString()
  vendorId: string;

  @ApiProperty({ example: 5, description: 'Note de 1 à 5' })
  @IsNotEmpty()
  @IsInt()
  @Min(1)
  @Max(5)
  rating: number;

  @ApiProperty({ example: 'Excellent service !', required: false, description: 'Commentaire de l\'avis' })
  @IsOptional()
  @IsString()
  comment?: string;
}
