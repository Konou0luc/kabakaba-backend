import { PartialType } from '@nestjs/swagger';
import { CreateMenuComponentDto } from './create-menu-component.dto';

export class UpdateMenuComponentDto extends PartialType(CreateMenuComponentDto) {}
