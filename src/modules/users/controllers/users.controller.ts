import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  Query,
  Request,
  UseGuards,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiQuery,
} from '@nestjs/swagger';
import { UsersService } from '../services/users.service';
import { CreateUserDto } from '../dto/create-user.dto';
import { CreateStaffUserDto } from '../dto/create-staff-user.dto';
import { UpdateUserDto } from '../dto/update-user.dto';
import { UserEntity } from '../entities/user.entity';
import { FindUsersQueryDto } from '../dto/find-users-query.dto';
import { Roles } from '../../../common/decorators/roles.decorator';
import { WebRoles } from '../../../common/decorators/web-roles.decorator';
import { UserRole, WebUserRole } from '@prisma/client';
import { JwtAuthGuard } from '../../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../../common/guards/roles.guard';
import { CombinedJwtAuthGuard } from '../../../common/guards/combined-jwt-auth.guard';
import { CombinedRolesGuard } from '../../../common/guards/combined-roles.guard';
import { GetCurrentUserId } from '../../../common/decorators/get-current-user.decorator';

@ApiTags('Users')
@Controller('users')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Post()
  @Throttle({ default: { limit: 10, ttl: 60000 } })
  @ApiOperation({ summary: 'Auto-inscription étudiant (public) — le rôle est toujours forcé à STUDENT' })
  @ApiResponse({ status: 201, description: "L'utilisateur a été créé avec succès.", type: UserEntity })
  @ApiResponse({ status: 400, description: 'Requête invalide.' })
  create(@Body() createUserDto: CreateUserDto) {
    return this.usersService.create(createUserDto);
  }

  @Post('staff')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN)
  @ApiOperation({ summary: 'Créer un compte ADMIN/VENDOR/SUPER_ADMIN (Admin/Super admin seulement)' })
  @ApiResponse({ status: 201, description: 'Compte créé avec succès.', type: UserEntity })
  createStaff(@Body() dto: CreateStaffUserDto) {
    return this.usersService.createStaff(dto);
  }

  @Get()
  @ApiBearerAuth()
  @UseGuards(CombinedJwtAuthGuard, CombinedRolesGuard)
  @Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN)
  @WebRoles(WebUserRole.SUPERVISION, WebUserRole.ADMIN)
  @ApiOperation({ summary: 'Récupérer tous les utilisateurs (admin/super admin/dashboard web)' })
  @ApiQuery({ type: FindUsersQueryDto })
  @ApiResponse({ status: 200, description: 'Retourne tous les utilisateurs avec pagination.' })
  findAll(@Query() query: FindUsersQueryDto) {
    return this.usersService.findAll(query.page, query.limit, query.role, query.campusId, query.isSuspended);
  }

  @Get('me')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: "Récupérer le profil de l'utilisateur actuel" })
  @ApiResponse({ status: 200, description: "Retourne l'utilisateur actuel.", type: UserEntity })
  getMe(@GetCurrentUserId() userId: string) {
    return this.usersService.findOne(userId);
  }

  @Get(':id')
  @ApiBearerAuth()
  @UseGuards(CombinedJwtAuthGuard)
  @ApiOperation({ summary: 'Récupérer un utilisateur par son identifiant (soi-même, ou rôle admin/supervision)' })
  @ApiResponse({ status: 200, description: "Retourne l'utilisateur.", type: UserEntity })
  @ApiResponse({ status: 403, description: "Vous n'avez pas accès à ce profil." })
  @ApiResponse({ status: 404, description: 'Utilisateur introuvable.' })
  findOne(@Param('id') id: string, @Request() req) {
    const isPrivileged =
      req.user.__authKind === 'web' ||
      req.user.role === UserRole.ADMIN ||
      req.user.role === UserRole.SUPER_ADMIN;
    return this.usersService.findOne(id, { id: req.user.id, isPrivileged });
  }

  @Patch(':id')
  @ApiBearerAuth()
  @UseGuards(CombinedJwtAuthGuard, CombinedRolesGuard)
  @Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN, UserRole.STUDENT, UserRole.VENDOR)
  @WebRoles(WebUserRole.SUPERVISION, WebUserRole.ADMIN)
  @ApiOperation({ summary: 'Mettre à jour un utilisateur — son propre profil, ou tout profil pour un admin/dashboard' })
  @ApiResponse({ status: 200, description: "L'utilisateur a été mis à jour avec succès.", type: UserEntity })
  @ApiResponse({ status: 403, description: 'Vous ne pouvez modifier que votre propre profil.' })
  update(@Param('id') id: string, @Body() updateUserDto: UpdateUserDto, @Request() req) {
    return this.usersService.update(id, updateUserDto, {
      id: req.user.id,
      kind: req.user.__authKind,
      role: req.user.role,
    });
  }

  @Delete(':id')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN)
  @ApiOperation({ summary: 'Désactiver un utilisateur (soft delete — admin/super admin seulement)' })
  @ApiResponse({ status: 200, description: "L'utilisateur a été désactivé avec succès." })
  remove(@Param('id') id: string) {
    return this.usersService.remove(id);
  }
}