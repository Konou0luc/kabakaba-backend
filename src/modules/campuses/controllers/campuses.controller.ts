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
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiQuery,
} from '@nestjs/swagger';
import { CampusesService } from '../services/campuses.service';
import { CreateCampusDto } from '../dto/create-campus.dto';
import { UpdateCampusDto } from '../dto/update-campus.dto';
import { CampusEntity } from '../entities/campus.entity';
import { PaginationDto } from '../../../common/dto/pagination.dto';
import { Roles } from '../../../common/decorators/roles.decorator';
import { UserRole } from '@prisma/client';
import { JwtAuthGuard } from '../../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../../common/guards/roles.guard';
import { Public } from '../../../common/decorators/public.decorator';

@ApiTags('Campuses')
@Controller('campuses')
export class CampusesController {
  constructor(private readonly campusesService: CampusesService) {}

  @Post()
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN)
  @ApiOperation({ summary: 'Create a new campus (Admin only)' })
  @ApiResponse({
    status: 201,
    description: 'The campus has been successfully created.',
    type: CampusEntity,
  })
  create(@Body() createCampusDto: CreateCampusDto) {
    return this.campusesService.create(createCampusDto);
  }

  @Get()
  @Public()
  @ApiOperation({ summary: 'Get all active campuses' })
  @ApiQuery({ type: PaginationDto })
  @ApiResponse({
    status: 200,
    description: 'Return all active campuses with pagination.',
  })
  findAll(@Query() paginationDto: PaginationDto) {
    return this.campusesService.findAll(paginationDto.page, paginationDto.limit);
  }

  @Get(':id')
  @Public()
  @ApiOperation({ summary: 'Get a single active campus' })
  @ApiResponse({ status: 200, description: 'Return the campus.', type: CampusEntity })
  @ApiResponse({ status: 404, description: 'Campus not found.' })
  findOne(@Param('id') id: string) {
    return this.campusesService.findOne(id);
  }

  @Patch(':id')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN)
  @ApiOperation({ summary: 'Update a campus (Admin only)' })
  @ApiResponse({
    status: 200,
    description: 'The campus has been successfully updated.',
    type: CampusEntity,
  })
  update(@Param('id') id: string, @Body() updateCampusDto: UpdateCampusDto) {
    return this.campusesService.update(id, updateCampusDto);
  }

  @Delete(':id')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN)
  @ApiOperation({ summary: 'Soft delete a campus (Admin only)' })
  @ApiResponse({
    status: 200,
    description: 'The campus has been successfully soft deleted.',
  })
  remove(@Param('id') id: string) {
    return this.campusesService.remove(id);
  }
}
