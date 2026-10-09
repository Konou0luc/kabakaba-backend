import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
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
import { WebJwtAuthGuard } from '../../../common/guards/web-jwt-auth.guard';
import { WebRolesGuard } from '../../../common/guards/web-roles.guard';

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

  // CDC V1.3, sections 36 et 49 : les avis laissés sur les commandes « Récupérée »
  // mesurent la satisfaction et sont consultables par l'administration, jamais
  // affichés publiquement aux autres étudiants. Accès strictement réservé
  // (rôle web Supervision), jamais @Public().
  @Get()
  @ApiBearerAuth()
  @UseGuards(WebJwtAuthGuard, WebRolesGuard)
  @WebRoles(WebUserRole.SUPERVISION)
  @ApiOperation({ summary: 'Récupérer tous les avis actifs — filtrable par vendeur, note, texte (Supervision uniquement)' })
  @ApiQuery({ type: FindReviewsQueryDto })
  @ApiResponse({ status: 200, description: 'Retourne tous les avis actifs avec pagination.' })
  findAll(@Query() query: FindReviewsQueryDto) {
    return this.reviewsService.findAll(query.page, query.limit, query.vendorId, query.rating, query.search, query.sortBy);
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

}