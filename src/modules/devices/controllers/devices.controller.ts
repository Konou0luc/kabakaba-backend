import { Body, Controller, Delete, Get, Post, Query, Request, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { UserRole } from '@prisma/client';
import { Roles } from '../../../common/decorators/roles.decorator';
import { CombinedJwtAuthGuard } from '../../../common/guards/combined-jwt-auth.guard';
import { CombinedRolesGuard } from '../../../common/guards/combined-roles.guard';
import { RegisterDeviceDto } from '../dto/register-device.dto';
import { DevicesService } from '../services/devices.service';

@ApiTags('Devices')
@Controller('devices')
@ApiBearerAuth()
@UseGuards(CombinedJwtAuthGuard, CombinedRolesGuard)
@Roles(UserRole.STUDENT, UserRole.VENDOR, UserRole.ADMIN, UserRole.SUPER_ADMIN)
export class DevicesController {
  constructor(private readonly devicesService: DevicesService) {}

  @Post()
  @ApiOperation({ summary: 'Enregistrer un token push (FCM / APNs)' })
  register(@Body() dto: RegisterDeviceDto, @Request() req: any) {
    return this.devicesService.register(req.user.id, dto);
  }

  @Get()
  @ApiOperation({ summary: 'Lister les appareils du compte connecté' })
  listMine(@Request() req: any) {
    return this.devicesService.listMine(req.user.id);
  }

  @Delete()
  @ApiOperation({ summary: 'Désenregistrer un token push' })
  unregister(@Query('deviceToken') deviceToken: string, @Request() req: any) {
    return this.devicesService.unregister(req.user.id, deviceToken);
  }
}
