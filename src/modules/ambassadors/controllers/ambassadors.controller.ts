import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiQuery,
} from '@nestjs/swagger';
import { AmbassadorsService } from '../services/ambassadors.service';
import { CreateAmbassadorDto } from '../dto/create-ambassador.dto';
import { UpdateAmbassadorDto } from '../dto/update-ambassador.dto';
import { AmbassadorEntity } from '../entities/ambassador.entity';
import { PaginationDto } from '../../../common/dto/pagination.dto';
import { Roles } from '../../../common/decorators/roles.decorator';
import { UserRole } from '@prisma/client';
import { JwtAuthGuard } from '../../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../../common/guards/roles.guard';
import { GetCurrentUserId } from '../../../common/decorators/get-current-user.decorator';

@ApiTags('Ambassadors')
@Controller('ambassadors')
export class AmbassadorsController {
  constructor(private readonly ambassadorsService: AmbassadorsService) {}

  @Post()
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN)
  @ApiOperation({ summary: 'Créer un nouvel ambassadeur (Admin seulement)' })
  @ApiResponse({
    status: 201,
    description: 'L\'ambassadeur a été créé avec succès.',
    type: AmbassadorEntity,
  })
  create(@Body() createAmbassadorDto: CreateAmbassadorDto) {
    return this.ambassadorsService.create(createAmbassadorDto);
  }

  @Get()
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN)
  @ApiOperation({ summary: 'Récupérer tous les ambassadeurs actifs (Admin seulement)' })
  @ApiQuery({ type: PaginationDto })
  @ApiResponse({
    status: 200,
    description: 'Retourne tous les ambassadeurs actifs avec pagination.',
  })
  findAll(@Query() paginationDto: PaginationDto) {
    return this.ambassadorsService.findAll(
      paginationDto.page,
      paginationDto.limit,
    );
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

  @Get(':id')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN)
  @ApiOperation({ summary: 'Récupérer un ambassadeur actif (Admin seulement)' })
  @ApiResponse({ status: 200, description: 'Retourne l\'ambassadeur.', type: AmbassadorEntity })
  @ApiResponse({ status: 404, description: 'Ambassadeur introuvable.' })
  findOne(@Param('id') id: string) {
    return this.ambassadorsService.findOne(id);
  }

  @Patch(':id')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN)
  @ApiOperation({ summary: 'Mettre à jour un ambassadeur (Admin seulement)' })
  @ApiResponse({
    status: 200,
    description: 'L\'ambassadeur a été mis à jour avec succès.',
    type: AmbassadorEntity,
  })
  update(@Param('id') id: string, @Body() updateAmbassadorDto: UpdateAmbassadorDto) {
    return this.ambassadorsService.update(id, updateAmbassadorDto);
  }

  @Delete(':id')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN)
  @ApiOperation({ summary: 'Supprimer un ambassadeur (Admin seulement)' })
  @ApiResponse({
    status: 200,
    description: 'L\'ambassadeur a été supprimé avec succès.',
  })
  remove(@Param('id') id: string) {
    return this.ambassadorsService.remove(id);
  }
}
