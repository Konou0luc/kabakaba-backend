import { Controller, Get, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../../common/guards/jwt-auth.guard';
import { GetCurrentUserId } from '../../../common/decorators/get-current-user.decorator';
import { ReferralsService } from '../services/referrals.service';

@ApiTags('Referrals')
@Controller('referrals')
export class ReferralsController {
  constructor(private readonly referralsService: ReferralsService) {}

  @Get('me')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Mon code de parrainage et le bilan de mes parrainages' })
  @ApiResponse({
    status: 200,
    description:
      'Retourne { referralCode, referredCount, rewardedCount, totalRewardTickets }.',
  })
  getMine(@GetCurrentUserId() userId: string) {
    return this.referralsService.getMine(userId);
  }
}
