import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { cert, getApps, initializeApp, type ServiceAccount } from 'firebase-admin/app';
import { getMessaging } from 'firebase-admin/messaging';
import { PrismaService } from '../../../database/services/prisma.service';

@Injectable()
export class FcmService {
  private readonly logger = new Logger(FcmService.name);
  private ready = false;

  constructor(
    private readonly config: ConfigService,
    private readonly prisma: PrismaService,
  ) {
    this.boot();
  }

  private boot() {
    if (getApps().length > 0) {
      this.ready = true;
      return;
    }
    try {
      const json = this.config.get<string>('FIREBASE_SERVICE_ACCOUNT_JSON');
      if (json?.trim()) {
        initializeApp({
          credential: cert(parseServiceAccount(json)),
        });
        this.ready = true;
        this.logger.log('FCM initialisé');
        return;
      }
      const projectId = this.config.get<string>('FIREBASE_PROJECT_ID');
      const clientEmail = this.config.get<string>('FIREBASE_CLIENT_EMAIL');
      let privateKey = this.config.get<string>('FIREBASE_PRIVATE_KEY');
      if (projectId && clientEmail && privateKey) {
        privateKey = privateKey.replace(/\\n/g, '\n');
        initializeApp({
          credential: cert({
            projectId,
            clientEmail,
            privateKey,
          }),
        });
        this.ready = true;
        return;
      }
      this.logger.warn(
        'FCM inactif : ajoute FIREBASE_SERVICE_ACCOUNT_JSON (ou PROJECT_ID + CLIENT_EMAIL + PRIVATE_KEY)',
      );
    } catch (error) {
      this.logger.error(
        'Impossible d’initialiser Firebase Admin',
        error instanceof Error ? error.stack : error,
      );
    }
  }

  async sendToUser(userId: string, title: string, body: string) {
    const devices = await this.prisma.device.findMany({
      where: { userId, deletedAt: null },
      select: { id: true, deviceToken: true },
    });
    if (devices.length === 0) {
      this.logger.warn(`FCM: aucun appareil enregistré user=${userId}`);
      return;
    }
    if (!this.ready) {
      this.logger.warn(`FCM inactif, ${devices.length} appareil(s) non notifié(s) user=${userId}`);
      return;
    }

    const tokens = devices.map((d) => d.deviceToken);
    const response = await getMessaging().sendEachForMulticast({
      tokens,
      notification: { title, body },
      android: {
        priority: 'high',
        notification: { channelId: 'kabakaba_default' },
      },
      apns: { payload: { aps: { sound: 'default' } } },
      data: { title, body },
    });
    this.logger.log(
      `FCM ${response.successCount}/${tokens.length} envoyé(s) user=${userId}`,
    );

    const stale: string[] = [];
    response.responses.forEach((item, index) => {
      if (item.success) return;
      const code = item.error?.code ?? '';
      if (
        code.includes('registration-token-not-registered') ||
        code.includes('invalid-registration-token') ||
        code.includes('invalid-argument')
      ) {
        stale.push(tokens[index]);
      } else {
        this.logger.warn(`FCM échec token=${tokens[index].slice(0, 8)}… ${code}`);
      }
    });

    if (stale.length > 0) {
      await this.prisma.device.updateMany({
        where: { deviceToken: { in: stale } },
        data: { deletedAt: new Date() },
      });
    }
  }
}

function parseServiceAccount(raw: string): ServiceAccount {
  const trimmed = raw.trim();
  try {
    return JSON.parse(trimmed) as ServiceAccount;
  } catch {
    return JSON.parse(Buffer.from(trimmed, 'base64').toString('utf8')) as ServiceAccount;
  }
}
