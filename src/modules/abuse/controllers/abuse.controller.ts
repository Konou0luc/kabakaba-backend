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
import { AbuseService } from '../services/abuse.service';
import { CreateAbuseDto } from '../dto/create-abuse.dto';
import { UpdateAbuseDto } from '../dto/update-abuse.dto';
import { AbuseEntity } from '../entities/abuse.entity';
import { PaginationDto } from '../../../common/dto/pagination.dto';
import { Roles } from '../../../common/decorators/roles.decorator';
import { WebRoles } from '../../../common/decorators/web-roles.decorator';
import { UserRole, WebUserRole } from '@prisma/client';
import { JwtAuthGuard } from '../../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../../common/guards/roles.guard';
import { CombinedJwtAuthGuard } from '../../../common/guards/combined-jwt-auth.guard';
import { CombinedRolesGuard } from '../../../common/guards/combined-roles.guard';

@ApiTags('Abuse')
@Controller('abuse')
export class AbuseController {
  constructor(private readonly abuseService: AbuseService) {}

  @Post()
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN)
  @ApiOperation({ summary: 'Créer un nouveau journal d\'abus (Admin seulement)' })
  @ApiResponse({
    status: 201,
    description: 'Le journal d\'abus a été créé avec succès.',
    type: AbuseEntity,
  })
  create(@Body() createAbuseDto: CreateAbuseDto) {
    return this.abuseService.create(createAbuseDto);
  }

  @Get()
  @ApiBearerAuth()
  @UseGuards(CombinedJwtAuthGuard, CombinedRolesGuard)
  @Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN)
  @WebRoles(WebUserRole.SUPERVISION, WebUserRole.ADMIN)
  @ApiOperation({ summary: 'Récupérer tous les journaux d\'abus actifs (Admin/dashboard web)' })
  @ApiQuery({ type: PaginationDto })
  @ApiResponse({
    status: 200,
    description: 'Retourne tous les journaux d\'abus actifs avec pagination.',
  })
  findAll(@Query() paginationDto: PaginationDto) {
    return this.abuseService.findAll(
      paginationDto.page,
      paginationDto.limit,
    );
  }

  @Get(':id')
  @ApiBearerAuth()
  @UseGuards(CombinedJwtAuthGuard, CombinedRolesGuard)
  @Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN)
  @WebRoles(WebUserRole.SUPERVISION, WebUserRole.ADMIN)
  @ApiOperation({ summary: 'Récupérer un journal d\'abus actif (Admin/dashboard web)' })
  @ApiResponse({ status: 200, description: 'Retourne le journal d\'abus.', type: AbuseEntity })
  @ApiResponse({ status: 404, description: 'Journal d\'abus introuvable.' })
  findOne(@Param('id') id: string) {
    return this.abuseService.findOne(id);
  }

  @Patch(':id')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN)
  @ApiOperation({ summary: 'Mettre à jour un journal d\'abus (Admin seulement)' })
  @ApiResponse({
    status: 200,
    description: 'Le journal d\'abus a été mis à jour avec succès.',
    type: AbuseEntity,
  })
  update(@Param('id') id: string, @Body() updateAbuseDto: UpdateAbuseDto) {
    return this.abuseService.update(id, updateAbuseDto);
  }

  @Delete(':id')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN)
  @ApiOperation({ summary: 'Supprimer un journal d\'abus (Admin seulement)' })
  @ApiResponse({
    status: 200,
    description: 'Le journal d\'abus a été supprimé avec succès.',
  })
  remove(@Param('id') id: string) {
    return this.abuseService.remove(id);
  }
}