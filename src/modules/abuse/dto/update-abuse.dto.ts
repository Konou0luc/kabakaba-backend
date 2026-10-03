import { PartialType } from '@nestjs/swagger';
import { CreateAbuseDto } from './create-abuse.dto';

export class UpdateAbuseDto extends PartialType(CreateAbuseDto) {}
