import { OmitType } from '@nestjs/swagger';
import { CreateComponentCategoryDto } from './create-component-category.dto';

// vendorId n'est jamais modifiable : la vérification de propriété porte sur l'ancien vendorId.
export class UpdateComponentCategoryDto extends OmitType(CreateComponentCategoryDto, ['vendorId'] as const) {}
