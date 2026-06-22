import { PartialType } from '@nestjs/swagger';
import { CreatePackagingOptionDto } from './create-packaging-option.dto';

export class UpdatePackagingOptionDto extends PartialType(CreatePackagingOptionDto) {}
