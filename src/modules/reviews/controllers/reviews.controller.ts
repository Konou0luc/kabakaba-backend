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
  Request,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiQuery,
} from '@nestjs/swagger';
import { ReviewsService } from '../services/reviews.service';
import { CreateReviewDto } from '../dto/create-review.dto';
import { UpdateReviewDto } from '../dto/update-review.dto';
import { FindReviewsQueryDto } from '../dto/find-reviews-query.dto';
import { ReviewEntity } from '../entities/review.entity';
import { Roles } from '../../../common/decorators/roles.decorator';
import { WebRoles } from '../../../common/decorators/web-roles.decorator';
import { UserRole, WebUserRole } from '@prisma/client';
import { JwtAuthGuard } from '../../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../../common/guards/roles.guard';
import { CombinedJwtAuthGuard } from '../../../common/guards/combined-jwt-auth.guard';
import { CombinedRolesGuard } from '../../../common/guards/combined-roles.guard';
import { Public } from '../../../common/decorators/public.decorator';

@ApiTags('Reviews')
@Controller('reviews')
export class ReviewsController {
  constructor(private readonly reviewsService: ReviewsService) {}

  @Post()
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.STUDENT)
  @ApiOperation({ summary: 'Créer un nouvel avis (Étudiant seulement)' })
  @ApiResponse({ status: 201, description: "L'avis a été créé avec succès.", type: ReviewEntity })
  create(@Body() createReviewDto: CreateReviewDto, @Request() req) {
    return this.reviewsService.create(createReviewDto, req.user.id);
  }

  @Get()
  @Public()
  @ApiOperation({ summary: 'Récupérer tous les avis actifs — filtrable par vendeur, note, texte' })
  @ApiQuery({ type: FindReviewsQueryDto })
  @ApiResponse({ status: 200, description: 'Retourne tous les avis actifs avec pagination.' })
  findAll(@Query() query: FindReviewsQueryDto) {
    return this.reviewsService.findAll(query.page, query.limit, query.vendorId, query.rating, query.search, query.sortBy);
  }

  @Get(':id')
  @Public()
  @ApiOperation({ summary: 'Récupérer un avis actif' })
  @ApiResponse({ status: 200, description: "Retourne l'avis.", type: ReviewEntity })
  @ApiResponse({ status: 404, description: 'Avis introuvable.' })
  findOne(@Param('id') id: string) {
    return this.reviewsService.findOne(id);
  }

  @Patch(':id')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.STUDENT)
  @ApiOperation({ summary: 'Mettre à jour un avis (Étudiant seulement)' })
  @ApiResponse({ status: 200, description: "L'avis a été mis à jour avec succès.", type: ReviewEntity })
  update(@Param('id') id: string, @Body() updateReviewDto: UpdateReviewDto, @Request() req) {
    return this.reviewsService.update(id, updateReviewDto, req.user.id);
  }

  @Delete(':id')
  @ApiBearerAuth()
  @UseGuards(CombinedJwtAuthGuard, CombinedRolesGuard)
  @Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN)
  @WebRoles(WebUserRole.ADMIN)
  @ApiOperation({ summary: 'Supprimer un avis (Admin mobile/web)' })
  @ApiResponse({ status: 200, description: "L'avis a été supprimé avec succès." })
  remove(@Param('id') id: string) {
    return this.reviewsService.remove(id);
  }
}