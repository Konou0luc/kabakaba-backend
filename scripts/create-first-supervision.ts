import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';
import * as bcrypt from 'bcrypt';
import * as dotenv from 'dotenv';

dotenv.config();

const SALT_ROUNDS = 10;

async function main() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error('DATABASE_URL manquant — vérifie ton fichier .env');
  }

  const pool = new Pool({ connectionString });
  const adapter = new PrismaPg(pool);
  const prisma = new PrismaClient({ adapter } as any);

  const email = 'ucao@kabakaba.app'; // ⚠️ remplace par le vrai email à utiliser
  const temporaryPassword = 'ChangeMoi123!'; // ⚠️ remplace par un mot de passe temporaire de ton choix

  try {
    const existing = await prisma.webUser.findUnique({ where: { email } });
    if (existing) {
      console.log('Un compte existe déjà avec cet email :', existing.id);
      return;
    }

    const hashedPassword = await bcrypt.hash(temporaryPassword, SALT_ROUNDS);

    const webUser = await prisma.webUser.create({
      data: {
        firstName: 'Xonin Hoel',        // ⚠️ à personnaliser
        lastName: 'AGBODEKA MELE',        // ⚠️ à personnaliser
        email,
        password: hashedPassword,
        role: 'SUPERVISION',
        isRoot: true,
        mustChangePassword: true,
      },
    });

    console.log('Compte Supervision créé :', webUser.id, webUser.email);
    console.log('Mot de passe temporaire à utiliser pour la première connexion :', temporaryPassword);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});