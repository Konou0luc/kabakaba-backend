import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Query,
  UseGuards,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiQuery,
  ApiConsumes,
  ApiBody,
} from '@nestjs/swagger';
import { FileInterceptor } from '@nestjs/platform-express';
import { AmbassadorsService } from '../services/ambassadors.service';
import { UpdateAmbassadorDto } from '../dto/update-ambassador.dto';
import { AmbassadorEntity } from '../entities/ambassador.entity';
import { FindAmbassadorsQueryDto } from '../dto/find-ambassadors-query.dto';
import { CreateSelfAmbassadorApplicationDto } from '../dto/create-self-ambassador-application.dto';
import { Roles } from '../../../common/decorators/roles.decorator';
import { WebRoles } from '../../../common/decorators/web-roles.decorator';
import { UserRole, WebUserRole } from '@prisma/client';
import { JwtAuthGuard } from '../../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../../common/guards/roles.guard';
import { CombinedJwtAuthGuard } from '../../../common/guards/combined-jwt-auth.guard';
import { CombinedRolesGuard } from '../../../common/guards/combined-roles.guard';
import { GetCurrentUserId } from '../../../common/decorators/get-current-user.decorator';
import { CloudinaryService } from '../../media/cloudinary.service';

@ApiTags('Ambassadors')
@Controller('ambassadors')
export class AmbassadorsController {
  constructor(
    private readonly ambassadorsService: AmbassadorsService,
    private readonly cloudinary: CloudinaryService,
  ) {}

  @Get()
  @ApiBearerAuth()
  @UseGuards(CombinedJwtAuthGuard, CombinedRolesGuard)
  @Roles(UserRole.ADMIN)
  @WebRoles(WebUserRole.SUPERVISION, WebUserRole.ADMIN)
  @ApiOperation({ summary: 'Récupérer tous les ambassadeurs (Admin/dashboard web)' })
  @ApiQuery({ type: FindAmbassadorsQueryDto })
  @ApiResponse({
    status: 200,
    description: 'Retourne tous les ambassadeurs avec pagination.',
  })
  findAll(@Query() query: FindAmbassadorsQueryDto) {
    return this.ambassadorsService.findAll(query.page, query.limit, query.status, query.level);
  }

  @Post('apply')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Soumettre une candidature ambassadeur pour l\'utilisateur connecté' })
  @ApiResponse({
    status: 201,
    description: 'La candidature a été enregistrée avec succès.',
    type: AmbassadorEntity,
  })
  @ApiResponse({ status: 409, description: 'L\'utilisateur a déjà une candidature ou un profil ambassadeur.' })
  createSelfApplication(
    @GetCurrentUserId() userId: string,
    @Body() createSelfAmbassadorApplicationDto: CreateSelfAmbassadorApplicationDto,
  ) {
    return this.ambassadorsService.createSelfApplication(
      userId,
      createSelfAmbassadorApplicationDto,
    );
  }

  @Post('school-card')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.STUDENT)
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: 4 * 1024 * 1024 } }))
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      required: ['file'],
      properties: { file: { type: 'string', format: 'binary' } },
    },
  })
  @ApiOperation({
    summary: 'Téléverser la carte scolaire (Cloudinary) — étudiant connecté',
  })
  uploadSchoolCard(
    @GetCurrentUserId() userId: string,
    @UploadedFile() file: { buffer: Buffer; size: number; originalname?: string },
  ) {
    return this.cloudinary.uploadImage(file, 'school-card', userId);
  }

  @Get('me')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Récupérer le profil ambassadeur de l\'utilisateur actuel' })
  @ApiResponse({ status: 200, description: 'Retourne l\'ambassadeur.', type: AmbassadorEntity })
  @ApiResponse({ status: 404, description: 'Ambassadeur introuvable.' })
  getMe(@GetCurrentUserId() userId: string) {
    return this.ambassadorsService.findByUserId(userId);
  }

  @Patch(':id')
  @ApiBearerAuth()
  @UseGuards(CombinedJwtAuthGuard, CombinedRolesGuard)
  @Roles(UserRole.ADMIN)
  @WebRoles(WebUserRole.ADMIN)
  @ApiOperation({ summary: 'Mettre à jour un ambassadeur (Admin/dashboard web Admin)' })
  @ApiResponse({
    status: 200,
    description: 'L\'ambassadeur a été mis à jour avec succès.',
    type: AmbassadorEntity,
  })
  update(@Param('id') id: string, @Body() updateAmbassadorDto: UpdateAmbassadorDto) {
    return this.ambassadorsService.update(id, updateAmbassadorDto);
  }

}