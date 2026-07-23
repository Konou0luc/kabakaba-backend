import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../../database/services/prisma.service';
import { CreateUserDto } from '../dto/create-user.dto';
import { UpdateUserDto } from '../dto/update-user.dto';
import * as bcrypt from 'bcrypt';
import { UserRole } from '@prisma/client';
import { SuspensionsService } from './suspensions.service';

interface Actor {
  id: string;
  kind: 'mobile' | 'web';
}

@Injectable()
export class UsersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly suspensionsService: SuspensionsService,
  ) {}

  async create(createUserDto: CreateUserDto) {
    const hashedPassword = createUserDto.password
      ? await bcrypt.hash(createUserDto.password, 10)
      : undefined;

    return this.prisma.user.create({
      data: {
        ...createUserDto,
        password: hashedPassword,
      },
    });
  }

  async findAll(
    page: number = 1,
    limit: number = 10,
    role?: UserRole,
    campusId?: string,
    isSuspended?: boolean,
  ) {
    const skip = (page - 1) * limit;
    const where = {
      ...(role ? { role } : {}),
      ...(campusId ? { campusId } : {}),
      ...(isSuspended !== undefined ? { isSuspended } : {}),
    };
    const [total, data] = await this.prisma.$transaction([
      this.prisma.user.count({ where }),
      this.prisma.user.findMany({
        where,
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
    const user = await this.prisma.user.findUnique({
      where: { id },
    });

    if (!user) throw new NotFoundException(`Utilisateur avec l'identifiant ${id} introuvable`);

    return user;
  }

  async findByEmail(email: string) {
    return this.prisma.user.findUnique({
      where: { email },
    });
  }

  async findByPhone(phone: string) {
    return this.prisma.user.findUnique({
      where: { phone },
    });
  }

  async update(id: string, updateUserDto: UpdateUserDto, actor?: Actor) {
    const current = await this.findOne(id);
    const hashedPassword = updateUserDto.password
      ? await bcrypt.hash(updateUserDto.password, 10)
      : undefined;

    const isSuspending = updateUserDto.isSuspended === true && !current.isSuspended;
    const isLifting = updateUserDto.isSuspended === false && current.isSuspended;

    if (isSuspending) {
      await this.suspensionsService.suspend({
        studentId: id,
        reason: updateUserDto.suspensionReason ?? 'Suspension manuelle',
        trigger: 'MANUAL',
        suspendedUntil: updateUserDto.suspensionUntil ? new Date(updateUserDto.suspensionUntil) : undefined,
        actor,
      });
    }

    if (isLifting) {
      await this.suspensionsService.lift(id, actor);
    }

    // Les champs de suspension sont déjà gérés par SuspensionsService ci-dessus ;
    // on les retire pour ne pas les écraser une seconde fois avec des valeurs
    // potentiellement différentes (ex: isBanned mis à jour par suspend()).
    const { isSuspended, suspensionUntil, suspensionReason, ...rest } = updateUserDto;

    return this.prisma.user.update({
      where: { id },
      data: {
        ...rest,
        password: hashedPassword,
      },
    });
  }

  async remove(id: string) {
    await this.findOne(id);
    return this.prisma.user.delete({
      where: { id },
    });
  }
}