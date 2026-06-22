import { ApiProperty } from '@nestjs/swagger';
import { IsString, IsNotEmpty } from 'class-validator';

export class RefreshTokenDto {
  @ApiProperty({ example: 'refresh_token_here', description: 'Token de renouvellement' })
  @IsString()
  @IsNotEmpty()
  refreshToken: string;
}
