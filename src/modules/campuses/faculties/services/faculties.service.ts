import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../../../database/services/prisma.service';
import { CreateFacultyDto } from '../dto/create-faculty.dto';
import { UpdateFacultyDto } from '../dto/update-faculty.dto';

@Injectable()
export class FacultiesService {
  constructor(private readonly prisma: PrismaService) {}

  private async assertCampusExists(campusId: string) {
    const campus = await this.prisma.campus.findUnique({ where: { id: campusId, deletedAt: null } });
    if (!campus) throw new NotFoundException(`Campus with id ${campusId} not found`);
  }

  async findAll(campusId: string) {
    await this.assertCampusExists(campusId);
    return this.prisma.facultyList.findMany({
      where: { campusId },
      orderBy: { name: 'asc' },
    });
  }

  async create(campusId: string, dto: CreateFacultyDto) {
    await this.assertCampusExists(campusId);
    return this.prisma.facultyList.create({
      data: { campusId, name: dto.name },
    });
  }

  async update(campusId: string, id: string, dto: UpdateFacultyDto) {
    const faculty = await this.prisma.facultyList.findUnique({ where: { id } });
    if (!faculty || faculty.campusId !== campusId) {
      throw new NotFoundException(`Faculté ${id} introuvable pour ce campus`);
    }
    return this.prisma.facultyList.update({ where: { id }, data: dto });
  }
}
