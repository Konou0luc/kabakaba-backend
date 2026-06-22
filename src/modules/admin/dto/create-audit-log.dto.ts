import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString, IsOptional } from 'class-validator';

export class CreateAuditLogDto {
  @ApiProperty({ example: 'user-uuid' })
  @IsNotEmpty()
  @IsString()
  adminId: string;

  @ApiProperty({ example: 'CREATE_USER' })
  @IsNotEmpty()
  @IsString()
  action: string;

  @ApiProperty({ example: 'User' })
  @IsNotEmpty()
  @IsString()
  entity: string;

  @ApiProperty({ example: 'entity-uuid' })
  @IsNotEmpty()
  @IsString()
  entityId: string;

  @ApiProperty({ required: false, example: { firstName: 'John' } })
  @IsOptional()
  metadata?: any;
}
