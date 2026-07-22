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
import { TransactionsService } from '../services/transactions.service';
import { CreateTransactionDto } from '../dto/create-transaction.dto';
import { UpdateTransactionDto } from '../dto/update-transaction.dto';
import { TransactionEntity } from '../entities/transaction.entity';
import { FindTransactionsQueryDto } from '../dto/find-transactions-query.dto';
import { Roles } from '../../../common/decorators/roles.decorator';
import { UserRole } from '@prisma/client';
import { JwtAuthGuard } from '../../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../../common/guards/roles.guard';

@ApiTags('Transactions')
@Controller('transactions')
export class TransactionsController {
  constructor(private readonly transactionsService: TransactionsService) {}

  @Post()
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN)
  @ApiOperation({ summary: 'Créer une nouvelle transaction (Admin seulement)' })
  @ApiResponse({
    status: 201,
    description: 'La transaction a été créée avec succès.',
    type: TransactionEntity,
  })
  create(@Body() createTransactionDto: CreateTransactionDto, @Request() req) {
    return this.transactionsService.create(createTransactionDto, req.user.id);
  }

  @Get()
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN, UserRole.STUDENT, UserRole.VENDOR)
  @ApiOperation({ summary: 'Récupérer toutes les transactions' })
  @ApiQuery({ type: FindTransactionsQueryDto })
  @ApiResponse({
    status: 200,
    description: 'Retourne toutes les transactions avec pagination.',
  })
  findAll(@Query() query: FindTransactionsQueryDto, @Request() req) {
    const isAdmin = req.user.role === UserRole.ADMIN || req.user.role === UserRole.SUPER_ADMIN;
    // Un utilisateur non-admin reste toujours scopé à ses propres transactions ;
    // le filtre userId de la query n'est pris en compte que pour les admins.
    const userId = isAdmin ? query.userId : req.user.id;
    return this.transactionsService.findAll(
      query.page,
      query.limit,
      userId,
      query.type,
      query.status,
    );
  }

  @Get(':id')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN, UserRole.STUDENT, UserRole.VENDOR)
  @ApiOperation({ summary: 'Récupérer une transaction' })
  @ApiResponse({ status: 200, description: 'Retourne la transaction.', type: TransactionEntity })
  @ApiResponse({ status: 404, description: 'Transaction introuvable.' })
  findOne(@Param('id') id: string) {
    return this.transactionsService.findOne(id);
  }

  @Patch(':id')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN)
  @ApiOperation({ summary: 'Mettre à jour une transaction (Admin seulement)' })
  @ApiResponse({
    status: 200,
    description: 'La transaction a été mise à jour avec succès.',
    type: TransactionEntity,
  })
  update(@Param('id') id: string, @Body() updateTransactionDto: UpdateTransactionDto) {
    return this.transactionsService.update(id, updateTransactionDto);
  }
}
