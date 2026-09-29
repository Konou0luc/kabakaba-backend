import {
  Controller,
  Post,
  Query,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import {
  ApiBearerAuth,
  ApiBody,
  ApiConsumes,
  ApiOperation,
  ApiQuery,
  ApiTags,
} from '@nestjs/swagger';
import { UserRole, WebUserRole } from '@prisma/client';
import { CombinedJwtAuthGuard } from '../../common/guards/combined-jwt-auth.guard';
import { CombinedRolesGuard } from '../../common/guards/combined-roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { WebRoles } from '../../common/decorators/web-roles.decorator';
import { CloudinaryService } from './cloudinary.service';
import type { MediaKind } from './cloudinary.service';
import { randomUUID } from 'crypto';

@ApiTags('Media')
@Controller('media')
@ApiBearerAuth()
@UseGuards(CombinedJwtAuthGuard, CombinedRolesGuard)
@Roles(UserRole.ADMIN)
@WebRoles(WebUserRole.ADMIN)
export class MediaController {
  constructor(private readonly cloudinary: CloudinaryService) {}

  @Post()
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: 4 * 1024 * 1024 } }))
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      required: ['file'],
      properties: { file: { type: 'string', format: 'binary' } },
    },
  })
  @ApiQuery({ name: 'kind', enum: ['logo', 'banner', 'dish'] })
  @ApiQuery({
    name: 'entityId',
    required: false,
    description: 'Id cantine ou plat. Si absent, un id temporaire est utilisé (à passer ensuite dans logoUrl / bannerUrl / imageUrl).',
  })
  @ApiOperation({
    summary: 'Uploader une image vers Cloudinary (admin web)',
    description:
      'Renvoie l’URL HTTPS à coller dans la création/édition de cantine ou de plat. Pour attacher directement à une fiche existante, préférer POST /vendors/:id/logo, /banner ou POST /catalog/menu-items/:id/image.',
  })
  upload(
    @UploadedFile() file: { buffer: Buffer; size: number; originalname?: string },
    @Query('kind') kind: MediaKind = 'dish',
    @Query('entityId') entityId?: string,
  ) {
    const safeKind: MediaKind =
      kind === 'logo' || kind === 'banner' || kind === 'dish' ? kind : 'dish';
    return this.cloudinary.uploadImage(file, safeKind, entityId?.trim() || randomUUID());
  }
}
