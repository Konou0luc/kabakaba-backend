import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiQuery, ApiResponse, ApiTags } from '@nestjs/swagger';
import { UserRole, WebUserRole } from '@prisma/client';
import { AnalyticsService } from '../services/analytics.service';
import { AnalyticsQueryDto } from '../dto/analytics-query.dto';
import { Roles } from '../../../common/decorators/roles.decorator';
import { WebRoles } from '../../../common/decorators/web-roles.decorator';
import { CombinedJwtAuthGuard } from '../../../common/guards/combined-jwt-auth.guard';
import { CombinedRolesGuard } from '../../../common/guards/combined-roles.guard';

@ApiTags('Analytics (Supervision)')
@Controller('admin/analytics')
@ApiBearerAuth()
@UseGuards(CombinedJwtAuthGuard, CombinedRolesGuard)
@Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN)
@WebRoles(WebUserRole.SUPERVISION, WebUserRole.ADMIN)
export class AnalyticsController {
  constructor(private readonly analyticsService: AnalyticsService) {}

  @Get('campuses')
  @ApiOperation({ summary: 'Comparaison des campus : KPI, tableau, volume 7 jours' })
  @ApiQuery({ type: AnalyticsQueryDto })
  @ApiResponse({ status: 200, description: 'Statistiques comparatives par campus.' })
  getCampusComparison(@Query() query: AnalyticsQueryDto) {
    return this.analyticsService.getCampusComparison(query.days);
  }

  @Get('top-canteens')
  @ApiOperation({ summary: 'Classement des cantines tous campus confondus' })
  @ApiQuery({ type: AnalyticsQueryDto })
  @ApiResponse({ status: 200, description: 'Classement des cantines.' })
  getTopCanteens(@Query() query: AnalyticsQueryDto) {
    return this.analyticsService.getTopCanteens(query.days, query.limit);
  }

  @Get('revenue')
  @ApiOperation({ summary: 'Décomposition des revenus (surplus recharges, frais non couverts, commissions)' })
  @ApiQuery({ type: AnalyticsQueryDto })
  @ApiResponse({ status: 200, description: 'Revenus décomposés, par campus et tendance 7 jours.' })
  getRevenueBreakdown(@Query() query: AnalyticsQueryDto) {
    return this.analyticsService.getRevenueBreakdown(query.days);
  }

  @Get('vendors')
  @ApiOperation({ summary: "Performance vendeurs : acceptation, refus, annulation, temps de réaction" })
  @ApiQuery({ type: AnalyticsQueryDto })
  @ApiResponse({ status: 200, description: 'Statistiques de performance par vendeur.' })
  getVendorPerformance(@Query() query: AnalyticsQueryDto) {
    return this.analyticsService.getVendorPerformance(query.days);
  }

  @Get('students')
  @ApiOperation({ summary: 'Comportement étudiants : inscrits, actifs, recharge moyenne, fréquence' })
  @ApiQuery({ type: AnalyticsQueryDto })
  @ApiResponse({ status: 200, description: 'Statistiques comportementales étudiants.' })
  getStudentBehavior(@Query() query: AnalyticsQueryDto) {
    return this.analyticsService.getStudentBehavior(query.days);
  }

  @Get('vendor-financials')
  @ApiOperation({ summary: 'Solde et créances par vendeur, retraits sur la période' })
  @ApiQuery({ type: AnalyticsQueryDto })
  @ApiResponse({ status: 200, description: 'Solde/créances par vendeur.' })
  getVendorFinancials(@Query() query: AnalyticsQueryDto) {
    return this.analyticsService.getVendorFinancials(query.days);
  }

  @Get('reviews')
  @ApiOperation({ summary: 'Qualité des avis : distribution, moyenne, cantines en alerte, tendance' })
  @ApiQuery({ type: AnalyticsQueryDto })
  @ApiResponse({ status: 200, description: 'Statistiques agrégées sur les avis.' })
  getReviewsQuality(@Query() query: AnalyticsQueryDto) {
    return this.analyticsService.getReviewsQuality(query.days);
  }
}