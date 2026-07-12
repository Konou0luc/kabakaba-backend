import { Controller, Post, Body, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth } from '@nestjs/swagger';
import { WalletService } from '../services/wallet.service';
import { SendMoneyDto } from '../dto/send-money.dto';
import { JwtAuthGuard } from '../../../common/guards/jwt-auth.guard';
import { GetCurrentUserId } from '../../../common/decorators/get-current-user.decorator';

@ApiTags('Wallet')
@Controller('wallet')
export class WalletController {
  constructor(private readonly walletService: WalletService) {}

  @Post('send')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: "Envoyer de l'argent à un autre utilisateur" })
  @ApiResponse({
    status: 201,
    description: "Argent envoyé avec succès",
  })
  @ApiResponse({
    status: 400,
    description: "Requête invalide (solde insuffisant, destinataire introuvable, etc.)",
  })
  sendMoney(
    @GetCurrentUserId() senderId: string,
    @Body() sendMoneyDto: SendMoneyDto,
  ) {
    return this.walletService.sendMoney(senderId, sendMoneyDto);
  }
}
