import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../../database/services/prisma.service';
import { RegisterDeviceDto } from '../dto/register-device.dto';

@Injectable()
export class DevicesService {
  constructor(private readonly prisma: PrismaService) {}

  async register(userId: string, dto: RegisterDeviceDto) {
    const existing = await this.prisma.device.findUnique({
      where: { deviceToken: dto.deviceToken },
    });
    if (existing && existing.userId !== userId) {
      throw new ConflictException('Ce token d’appareil est déjà associé à un autre compte');
    }
    if (existing) {
      return this.prisma.device.update({
        where: { id: existing.id },
        data: {
          userId,
          platform: dto.platform,
          lastUsedAt: new Date(),
          deletedAt: null,
        },
      });
    }
    return this.prisma.device.create({
      data: {
        userId,
        deviceToken: dto.deviceToken,
        platform: dto.platform,
      },
    });
  }

  async unregister(userId: string, deviceToken: string) {
    const device = await this.prisma.device.findFirst({
      where: { deviceToken, userId, deletedAt: null },
    });
    if (!device) throw new NotFoundException('Appareil introuvable');
    return this.prisma.device.update({
      where: { id: device.id },
      data: { deletedAt: new Date() },
    });
  }

  async listMine(userId: string) {
    const devices = await this.prisma.device.findMany({
      where: { userId, deletedAt: null },
      orderBy: { lastUsedAt: 'desc' },
    });

    return devices.map(({ deviceToken, ...device }) => ({
      ...device,
      deviceToken: `${deviceToken.slice(0, 6)}…${deviceToken.slice(-4)}`,
    }));
  }
}
