import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../../database/services/prisma.service';
import { CreateCampusDto } from '../dto/create-campus.dto';
import { UpdateCampusDto } from '../dto/update-campus.dto';

@Injectable()
export class CampusesService {
  constructor(private readonly prisma: PrismaService) {}

  async create(createCampusDto: CreateCampusDto) {
    return this.prisma.campus.create({
      data: createCampusDto,
    });
  }

  async findAll(page: number = 1, limit: number = 10) {
    const skip = (page - 1) * limit;
    const [total, data] = await this.prisma.$transaction([
      this.prisma.campus.count({
        where: { deletedAt: null },
      }),
      this.prisma.campus.findMany({
        where: { deletedAt: null },
        skip,
        take: limit,
      }),
    ]);

    return {
      data,
      meta: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  async findOne(id: string) {
    const campus = await this.prisma.campus.findUnique({
      where: { id, deletedAt: null },
    });

    if (!campus) throw new NotFoundException(`Campus with id ${id} not found`);

    return campus;
  }

  async update(id: string, updateCampusDto: UpdateCampusDto) {
    await this.findOne(id);
    return this.prisma.campus.update({
      where: { id },
      data: updateCampusDto,
    });
  }

  async remove(id: string) {
    await this.findOne(id);
    return this.prisma.campus.update({
      where: { id },
      data: { deletedAt: new Date() },
    });
  }
}
