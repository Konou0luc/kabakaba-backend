import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString, IsOptional, MaxLength, IsObject } from 'class-validator';

export class CreateAuditLogDto {
  @ApiProperty({ example: 'CREATE_USER' })
  @IsNotEmpty()
  @IsString()
  @MaxLength(100)
  action: string;

  @ApiProperty({ example: 'User' })
  @IsNotEmpty()
  @IsString()
  @MaxLength(100)
  entity: string;

  @ApiProperty({ example: 'entity-uuid' })
  @IsNotEmpty()
  @IsString()
  @MaxLength(100)
  entityId: string;

  @ApiProperty({ required: false, example: { firstName: 'John' } })
  @IsOptional()
  @IsObject()
  metadata?: Record<string, unknown>;
}
