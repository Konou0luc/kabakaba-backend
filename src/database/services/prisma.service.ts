import { Injectable, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';

function resolveConnectionString(): string | undefined {
  // La base utilisée par l'API est la base distante, quel que soit
  // l'environnement qui exécute le backend (local, Vercel, etc.). Ne pas
  // basculer silencieusement sur DATABASE_URL : cela pourrait écrire dans
  // une base locale différente pendant les tests mobiles.
  return process.env.DATABASE_URL_PROD;
}

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  constructor() {
    const connectionString = resolveConnectionString();

    if (!connectionString) {
      super();
      return;
    }

    try {
      // En serverless (Vercel), chaque instance/fonction peut tourner en
      // parallèle : un pool trop large (défaut = 10) multiplie le nombre de
      // connexions ouvertes vers le pooler Neon et peut le saturer, ajoutant
      // de la latence de connexion. On limite donc le pool par instance.
      const isServerless = Boolean(process.env.VERCEL || process.env.NEST_SERVERLESS === 'true');
      const pool = new Pool({ connectionString, max: isServerless ? 3 : 10 });
      const adapter = new PrismaPg(pool);
      super({ adapter } as any);
    } catch (error) {
      console.error('Failed to initialize Prisma adapter:', error);
      super();
    }
  }

  async onModuleInit() {
    const isServerless = Boolean(process.env.VERCEL || process.env.NEST_SERVERLESS === 'true');
    const connectionString = resolveConnectionString();

    if (!connectionString || isServerless) {
      return;
    }

    try {
      await Promise.race([
        this.$connect(),
        new Promise((_, reject) => {
          setTimeout(() => reject(new Error('Prisma connection timed out')), 3000);
        }),
      ]);
    } catch (error) {
      console.error('Prisma connection failed during startup:', error);
    }
  }

  async onModuleDestroy() {
    try {
      await this.$disconnect();
    } catch (error) {
      console.error('Prisma disconnect failed:', error);
    }
  }
}
