import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Query,
  Request,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiBody,
  ApiConsumes,
  ApiQuery,
} from '@nestjs/swagger';
import { UsersService } from '../services/users.service';
import { UpdateUserDto } from '../dto/update-user.dto';
import { UserEntity } from '../entities/user.entity';
import { FindUsersQueryDto } from '../dto/find-users-query.dto';
import { Roles } from '../../../common/decorators/roles.decorator';
import { WebRoles } from '../../../common/decorators/web-roles.decorator';
import { UserRole, WebUserRole } from '@prisma/client';
import { JwtAuthGuard } from '../../../common/guards/jwt-auth.guard';
import { CombinedJwtAuthGuard } from '../../../common/guards/combined-jwt-auth.guard';
import { CombinedRolesGuard } from '../../../common/guards/combined-roles.guard';
import { GetCurrentUserId } from '../../../common/decorators/get-current-user.decorator';

@ApiTags('Users')
@Controller('users')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Get()
  @ApiBearerAuth()
  @UseGuards(CombinedJwtAuthGuard, CombinedRolesGuard)
  @Roles(UserRole.ADMIN)
  @WebRoles(WebUserRole.SUPERVISION, WebUserRole.ADMIN)
  @ApiOperation({ summary: 'Récupérer tous les utilisateurs (administrateur mobile, comptes web Admin et Supervision)' })
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

  @Post('me/avatar')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @UseInterceptors(FileInterceptor('file'))
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      properties: { file: { type: 'string', format: 'binary' } },
    },
  })
  @ApiOperation({ summary: 'Photo de profil étudiant (Cloudinary)' })
  @ApiResponse({ status: 201, description: '{ avatarUrl }' })
  uploadAvatar(
    @GetCurrentUserId() userId: string,
    @UploadedFile() file: { buffer: Buffer; mimetype: string; size: number },
  ) {
    return this.usersService.uploadAvatar(userId, file);
  }

  @Get(':id')
  @ApiBearerAuth()
  @UseGuards(CombinedJwtAuthGuard)
  @ApiOperation({ summary: 'Récupérer un utilisateur par son identifiant (soi-même, ou rôle admin/supervision)' })
  @ApiResponse({ status: 200, description: "Retourne l'utilisateur.", type: UserEntity })
  @ApiResponse({ status: 403, description: "Vous n'avez pas accès à ce profil." })
  @ApiResponse({ status: 404, description: 'Utilisateur introuvable.' })
  findOne(@Param('id') id: string, @Request() req) {
    const isWeb = req.user.__authKind === 'web';
    const isPrivileged = isWeb && (
      req.user.role === WebUserRole.ADMIN ||
      req.user.role === WebUserRole.SUPERVISION
    );
    return this.usersService.findOne(id, { id: req.user.id, isPrivileged });
  }

  @Patch(':id')
  @ApiBearerAuth()
  @UseGuards(CombinedJwtAuthGuard, CombinedRolesGuard)
  @Roles(UserRole.ADMIN, UserRole.STUDENT, UserRole.VENDOR)
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

}