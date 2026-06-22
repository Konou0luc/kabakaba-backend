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
import { ReviewEntity } from '../entities/review.entity';
import { PaginationDto } from '../../../common/dto/pagination.dto';
import { Roles } from '../../../common/decorators/roles.decorator';
import { UserRole } from '@prisma/client';
import { JwtAuthGuard } from '../../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../../common/guards/roles.guard';
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
  @ApiResponse({
    status: 201,
    description: 'L\'avis a été créé avec succès.',
    type: ReviewEntity,
  })
  create(@Body() createReviewDto: CreateReviewDto, @Request() req) {
    return this.reviewsService.create(createReviewDto, req.user.id);
  }

  @Get()
  @Public()
  @ApiOperation({ summary: 'Récupérer tous les avis actifs' })
  @ApiQuery({ name: 'vendorId', required: false, type: String })
  @ApiQuery({ type: PaginationDto })
  @ApiResponse({
    status: 200,
    description: 'Retourne tous les avis actifs avec pagination.',
  })
  findAll(
    @Query('vendorId') vendorId?: string,
    @Query() paginationDto?: PaginationDto,
  ) {
    return this.reviewsService.findAll(
      paginationDto?.page,
      paginationDto?.limit,
      vendorId,
    );
  }

  @Get(':id')
  @Public()
  @ApiOperation({ summary: 'Récupérer un avis actif' })
  @ApiResponse({ status: 200, description: 'Retourne l\'avis.', type: ReviewEntity })
  @ApiResponse({ status: 404, description: 'Avis introuvable.' })
  findOne(@Param('id') id: string) {
    return this.reviewsService.findOne(id);
  }

  @Patch(':id')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.STUDENT)
  @ApiOperation({ summary: 'Mettre à jour un avis (Étudiant seulement)' })
  @ApiResponse({
    status: 200,
    description: 'L\'avis a été mis à jour avec succès.',
    type: ReviewEntity,
  })
  update(
    @Param('id') id: string,
    @Body() updateReviewDto: UpdateReviewDto,
    @Request() req,
  ) {
    return this.reviewsService.update(id, updateReviewDto, req.user.id);
  }

  @Delete(':id')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN)
  @ApiOperation({ summary: 'Supprimer un avis (Admin seulement)' })
  @ApiResponse({
    status: 200,
    description: 'L\'avis a été supprimé avec succès.',
  })
  remove(@Param('id') id: string) {
    return this.reviewsService.remove(id);
  }
}
