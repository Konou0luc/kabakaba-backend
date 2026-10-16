/**
 * Crée le premier compte WebUser SUPERVISION (root) hors API.
 *
 * Usage :
 *   DATABASE_URL_PROD="postgresql://..." npm run bootstrap:supervision
 *
 * Options via env :
 *   BOOTSTRAP_EMAIL      (défaut : supervision@kabakaba.app)
 *   BOOTSTRAP_PASSWORD   (défaut : généré aléatoirement, affiché une fois)
 *   BOOTSTRAP_FIRST_NAME (défaut : Super)
 *   BOOTSTRAP_LAST_NAME  (défaut : Vision)
 *   BOOTSTRAP_RESET=1    (réinitialise le mot de passe si le compte existe déjà)
 */
import 'dotenv/config';
import crypto from 'crypto';
import bcrypt from 'bcrypt';
import pg from 'pg';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient, WebUserRole } from '@prisma/client';

const connectionString = process.env.DATABASE_URL_PROD;
if (!connectionString) {
  console.error('❌ DATABASE_URL_PROD manquant.');
  console.error('   Exemple : DATABASE_URL_PROD="postgresql://..." npm run bootstrap:supervision');
  process.exit(1);
}

const email = (process.env.BOOTSTRAP_EMAIL || 'supervision@kabakaba.app').trim().toLowerCase();
const firstName = process.env.BOOTSTRAP_FIRST_NAME || 'Super';
const lastName = process.env.BOOTSTRAP_LAST_NAME || 'Vision';
const reset = process.env.BOOTSTRAP_RESET === '1';
const temporaryPassword =
  process.env.BOOTSTRAP_PASSWORD ||
  crypto.randomBytes(9).toString('base64url').replace(/[^a-zA-Z0-9]/g, '').slice(0, 12);

const pool = new pg.Pool({ connectionString, max: 2 });
const prisma = new PrismaClient({ adapter: new PrismaPg(pool) });

async function main() {
  const existing = await prisma.webUser.findUnique({ where: { email } });

  if (existing && !reset) {
    console.log(`ℹ️  Un compte existe déjà pour ${email}`);
    console.log(`   rôle=${existing.role} isRoot=${existing.isRoot} isActive=${existing.isActive}`);
    console.log('   Pour réinitialiser le mot de passe temporaire :');
    console.log('   BOOTSTRAP_RESET=1 DATABASE_URL_PROD="..." npm run bootstrap:supervision');
    return;
  }

  const passwordHash = await bcrypt.hash(temporaryPassword, 10);

  if (existing && reset) {
    await prisma.webUser.update({
      where: { id: existing.id },
      data: {
        password: passwordHash,
        mustChangePassword: true,
        isActive: false,
        isRoot: true,
        role: WebUserRole.SUPERVISION,
        twoFaEnabled: false,
        twoFaSecret: null,
        tokenVersion: { increment: 1 },
      },
    });
    // Invalide les codes de secours éventuels
    await prisma.webUserBackupCode.deleteMany({ where: { webUserId: existing.id } });
    console.log('✅ Mot de passe temporaire réinitialisé (compte root Supervision).');
  } else {
    await prisma.webUser.create({
      data: {
        firstName,
        lastName,
        email,
        password: passwordHash,
        role: WebUserRole.SUPERVISION,
        isRoot: true,
        isActive: false,
        mustChangePassword: true,
        twoFaEnabled: false,
        avatarInitials: `${firstName[0] || 'S'}${lastName[0] || 'V'}`.toUpperCase(),
        avatarColor: '#1B2A6B',
      },
    });
    console.log('✅ Compte Supervision root créé.');
  }

  console.log('');
  console.log('── Identifiants de première connexion ──');
  console.log(`   Email    : ${email}`);
  console.log(`   Mot de passe temporaire : ${temporaryPassword}`);
  console.log('');
  console.log('Ensuite sur l’interface Supervision :');
  console.log('  1. Première connexion (pas le login normal)');
  console.log('  2. Définir un nouveau mot de passe');
  console.log('  3. Configurer la 2FA (Authenticator)');
  console.log('  4. Se reconnecter normalement avec email + MDP + code 2FA');
}

main()
  .catch((err) => {
    console.error('❌ Échec bootstrap :', err.message || err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect().catch(() => {});
    await pool.end().catch(() => {});
  });
