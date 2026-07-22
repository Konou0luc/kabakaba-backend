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
import { UsersService } from '../services/users.service';
import { CreateUserDto } from '../dto/create-user.dto';
import { UpdateUserDto } from '../dto/update-user.dto';
import { UserEntity } from '../entities/user.entity';
import { FindUsersQueryDto } from '../dto/find-users-query.dto';
import { Roles } from '../../../common/decorators/roles.decorator';
import { UserRole } from '@prisma/client';
import { JwtAuthGuard } from '../../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../../common/guards/roles.guard';
import { GetCurrentUserId } from '../../../common/decorators/get-current-user.decorator';

@ApiTags('Users')
@Controller('users')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Post()
  @ApiOperation({ summary: 'Créer un nouvel utilisateur' })
  @ApiResponse({
    status: 201,
    description: 'L\'utilisateur a été créé avec succès.',
    type: UserEntity,
  })
  @ApiResponse({ status: 400, description: 'Requête invalide.' })
  create(@Body() createUserDto: CreateUserDto) {
    return this.usersService.create(createUserDto);
  }

  @Get()
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN)
  @ApiOperation({ summary: 'Récupérer tous les utilisateurs (admin/super admin seulement)' })
  @ApiQuery({ type: FindUsersQueryDto })
  @ApiResponse({
    status: 200,
    description: 'Retourne tous les utilisateurs avec pagination.',
  })
  findAll(@Query() query: FindUsersQueryDto) {
    return this.usersService.findAll(
      query.page,
      query.limit,
      query.role,
      query.campusId,
      query.isSuspended,
    );
  }

  @Get('me')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Récupérer le profil de l\'utilisateur actuel' })
  @ApiResponse({ status: 200, description: 'Retourne l\'utilisateur actuel.', type: UserEntity })
  getMe(@GetCurrentUserId() userId: string) {
    return this.usersService.findOne(userId);
  }

  @Get(':id')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Récupérer un utilisateur par son identifiant' })
  @ApiResponse({ status: 200, description: 'Retourne l\'utilisateur.', type: UserEntity })
  @ApiResponse({ status: 404, description: 'Utilisateur introuvable.' })
  findOne(@Param('id') id: string) {
    return this.usersService.findOne(id);
  }

  @Patch(':id')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Mettre à jour un utilisateur' })
  @ApiResponse({
    status: 200,
    description: 'L\'utilisateur a été mis à jour avec succès.',
    type: UserEntity,
  })
  update(@Param('id') id: string, @Body() updateUserDto: UpdateUserDto) {
    return this.usersService.update(id, updateUserDto);
  }

  @Delete(':id')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN)
  @ApiOperation({ summary: 'Supprimer un utilisateur (admin/super admin seulement)' })
  @ApiResponse({
    status: 200,
    description: 'L\'utilisateur a été supprimé avec succès.',
  })
  remove(@Param('id') id: string) {
    return this.usersService.remove(id);
  }
}
