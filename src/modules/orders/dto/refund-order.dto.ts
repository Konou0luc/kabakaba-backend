import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString, MinLength } from 'class-validator';

export class RefundOrderDto {
  @ApiProperty({
    example: 'Plat non conforme / étudiant n\'est pas venu',
    description: 'Motif obligatoire du remboursement post-READY (CDC 4.7)',
  })
  @IsString()
  @IsNotEmpty()
  @MinLength(3)
  reason: string;
}
