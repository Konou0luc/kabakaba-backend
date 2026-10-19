import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { cert, getApps, initializeApp, type ServiceAccount } from 'firebase-admin/app';
import { getMessaging } from 'firebase-admin/messaging';
import { PrismaService } from '../../../database/services/prisma.service';

@Injectable()
export class FcmService {
  private readonly logger = new Logger(FcmService.name);
  private ready = false;
  private bootError: string | null = null;
  private projectId: string | null = null;

  constructor(
    private readonly config: ConfigService,
    private readonly prisma: PrismaService,
  ) {
    this.boot();
  }

  isReady() {
    return this.ready;
  }

  status() {
    return {
      ready: this.ready,
      projectId: this.projectId,
      error: this.bootError,
    };
  }

  private boot() {
    if (getApps().length > 0) {
      this.ready = true;
      return;
    }
    try {
      const json = this.config.get<string>('FIREBASE_SERVICE_ACCOUNT_JSON');
      if (json?.trim()) {
        const account = parseServiceAccount(json);
        initializeApp({
          credential: cert(account),
        });
        this.ready = true;
        this.projectId = account.projectId ?? null;
        this.logger.log(`FCM initialisé project=${this.projectId ?? '?'}`);
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
        this.projectId = projectId;
        this.logger.log(`FCM initialisé project=${projectId}`);
        return;
      }
      this.bootError =
        'FIREBASE_SERVICE_ACCOUNT_JSON manquant (ou PROJECT_ID + CLIENT_EMAIL + PRIVATE_KEY)';
      this.logger.warn(`FCM inactif : ${this.bootError}`);
    } catch (error) {
      this.bootError = error instanceof Error ? error.message : String(error);
      this.logger.error(
        'Impossible d’initialiser Firebase Admin',
        error instanceof Error ? error.stack : error,
      );
    }
  }

  async sendToUser(
    userId: string,
    title: string,
    body: string,
    options: {
      kind?: string;
      channelId?: string;
      sound?: string;
      data?: Record<string, string>;
    } = {},
  ) {
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

    const channelId = options.channelId ?? 'kabakaba_default';
    const sound = options.sound ?? 'default';
    const kind = options.kind ?? 'INFO';
    const tokens = devices.map((d) => d.deviceToken);
    const response = await getMessaging().sendEachForMulticast({
      tokens,
      notification: { title, body },
      android: {
        priority: 'high',
        notification: {
          channelId,
          sound: sound === 'default' ? 'default' : sound,
          defaultSound: sound === 'default',
          defaultVibrateTimings: true,
        },
      },
      apns: {
        payload: {
          aps: {
            sound: sound === 'default' ? 'default' : `${sound}.caf`,
            contentAvailable: true,
          },
        },
      },
      data: {
        title,
        body,
        kind,
        channelId,
        ...(options.data ?? {}),
      },
    });
    this.logger.log(
      `FCM ${response.successCount}/${tokens.length} envoyé(s) user=${userId} kind=${kind}`,
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
  if (!trimmed) {
    throw new Error('FIREBASE_SERVICE_ACCOUNT_JSON est vide');
  }
  // Vercel / dotenv : parfois le JSON est entouré de quotes ou les \n sont échappés.
  const unquoted =
    (trimmed.startsWith("'") && trimmed.endsWith("'")) ||
    (trimmed.startsWith('"') && trimmed.endsWith('"'))
      ? trimmed.slice(1, -1)
      : trimmed;
  const candidates = [unquoted, unquoted.replace(/\\n/g, '\n')];
  for (const candidate of candidates) {
    try {
      const parsed = JSON.parse(candidate) as ServiceAccount & {
        project_id?: string;
        client_email?: string;
        private_key?: string;
      };
      // Accepte le format téléchargé depuis Firebase (snake_case).
      return {
        projectId: parsed.projectId ?? parsed.project_id,
        clientEmail: parsed.clientEmail ?? parsed.client_email,
        privateKey: (parsed.privateKey ?? parsed.private_key)?.replace(
          /\\n/g,
          '\n',
        ),
      } as ServiceAccount;
    } catch {
      /* try next / base64 */
    }
  }
  try {
    const decoded = Buffer.from(trimmed, 'base64').toString('utf8');
    const parsed = JSON.parse(decoded) as ServiceAccount & {
      project_id?: string;
      client_email?: string;
      private_key?: string;
    };
    return {
      projectId: parsed.projectId ?? parsed.project_id,
      clientEmail: parsed.clientEmail ?? parsed.client_email,
      privateKey: (parsed.privateKey ?? parsed.private_key)?.replace(
        /\\n/g,
        '\n',
      ),
    } as ServiceAccount;
  } catch (error) {
    throw new Error(
      `FIREBASE_SERVICE_ACCOUNT_JSON invalide: ${
        error instanceof Error ? error.message : String(error)
      }`,
    );
  }
}
