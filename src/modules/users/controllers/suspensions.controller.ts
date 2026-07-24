import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiQuery, ApiResponse, ApiTags } from '@nestjs/swagger';
import { UserRole, WebUserRole } from '@prisma/client';
import { SuspensionsService } from '../services/suspensions.service';
import { FindSuspensionEventsQueryDto } from '../dto/find-suspension-events-query.dto';
import { Roles } from '../../../common/decorators/roles.decorator';
import { WebRoles } from '../../../common/decorators/web-roles.decorator';
import { CombinedJwtAuthGuard } from '../../../common/guards/combined-jwt-auth.guard';
import { CombinedRolesGuard } from '../../../common/guards/combined-roles.guard';

@ApiTags('Suspension Events')
@Controller('suspension-events')
export class SuspensionsController {
  constructor(private readonly suspensionsService: SuspensionsService) {}

  @Get()
  @ApiBearerAuth()
  @UseGuards(CombinedJwtAuthGuard, CombinedRolesGuard)
  @Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN)
  @WebRoles(WebUserRole.SUPERVISION, WebUserRole.ADMIN)
  @ApiOperation({ summary: 'Historique complet des suspensions (actives, levées, bannissements) — Admin/dashboard web' })
  @ApiQuery({ type: FindSuspensionEventsQueryDto })
  @ApiResponse({ status: 200, description: 'Retourne les événements de suspension avec pagination.' })
  findAll(@Query() query: FindSuspensionEventsQueryDto) {
    return this.suspensionsService.findAll(query.page, query.limit, query.status, query.trigger, query.studentId);
  }
}