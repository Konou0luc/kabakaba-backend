import { Controller, Get } from '@nestjs/common';
import { PrismaService } from './database/services/prisma.service';

@Controller()
export class AppController {
  constructor(private readonly prisma: PrismaService) {}

  // Endpoint minimal utilisé par le cron de keep-alive (GitHub Actions) pour
  // empêcher Neon de suspendre son compute entre deux visites réelles.
  // Fait une vraie requête DB (pas juste un "ping" HTTP) car c'est bien
  // l'activité DB qui compte pour Neon, pas l'activité de la fonction Vercel.
  @Get('health')
  async health() {
    await this.prisma.$queryRaw`SELECT 1`;
    return { status: 'ok', time: new Date().toISOString() };
  }
}
