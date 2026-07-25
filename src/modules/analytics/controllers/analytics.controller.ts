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
}