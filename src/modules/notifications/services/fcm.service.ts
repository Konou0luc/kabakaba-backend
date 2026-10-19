import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { cert, getApps, initializeApp, type ServiceAccount } from 'firebase-admin/app';
import { getMessaging } from 'firebase-admin/messaging';
import { PrismaService } from '../../../database/services/prisma.service';

export type FcmSendResult = {
  successCount: number;
  failureCount: number;
  deviceCount: number;
  errors: string[];
};

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
      link?: string;
      data?: Record<string, string>;
    } = {},
  ): Promise<FcmSendResult> {
    const empty: FcmSendResult = {
      successCount: 0,
      failureCount: 0,
      deviceCount: 0,
      errors: [],
    };

    const devices = await this.prisma.device.findMany({
      where: { userId, deletedAt: null },
      select: { id: true, deviceToken: true, platform: true },
    });
    if (devices.length === 0) {
      this.logger.warn(`FCM: aucun appareil enregistré user=${userId}`);
      return { ...empty, errors: ['no_devices'] };
    }
    if (!this.ready) {
      this.logger.warn(`FCM inactif, ${devices.length} appareil(s) non notifié(s) user=${userId}`);
      return {
        ...empty,
        deviceCount: devices.length,
        errors: [this.bootError || 'fcm_not_ready'],
      };
    }

    const channelId = options.channelId ?? 'kabakaba_default';
    const sound = options.sound ?? 'default';
    const kind = options.kind ?? 'INFO';
    const tokens = devices.map((d) => d.deviceToken);
    // FCM data payload = strings only.
    const data: Record<string, string> = {
      title,
      body,
      kind,
      channelId,
    };
    for (const [k, v] of Object.entries(options.data ?? {})) {
      if (v === undefined || v === null) continue;
      data[k] = String(v);
    }

    const link =
      options.link ||
      this.config.get<string>('PWA_VENDOR_URL') ||
      this.config.get<string>('PWA_STUDENT_URL') ||
      undefined;

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
      // Requis pour les tokens WEB (PWA) — sinon souvent in-app OK / push silencieux.
      webpush: {
        headers: {
          Urgency: 'high',
          TTL: '86400',
        },
        notification: {
          title,
          body,
          icon: '/pwa-192.png',
          badge: '/pwa-192.png',
          tag: kind,
          renotify: true,
        },
        ...(link
          ? {
              fcmOptions: { link },
            }
          : {}),
      },
      data,
    });

    this.logger.log(
      `FCM ${response.successCount}/${tokens.length} envoyé(s) user=${userId} kind=${kind}`,
    );

    const errors: string[] = [];
    const stale: string[] = [];
    response.responses.forEach((item, index) => {
      if (item.success) return;
      const code = item.error?.code ?? 'unknown';
      const message = item.error?.message ?? '';
      errors.push(`${tokens[index].slice(0, 8)}…:${code}`);
      this.logger.warn(
        `FCM échec token=${tokens[index].slice(0, 8)}… ${code} ${message}`,
      );
      if (
        code.includes('registration-token-not-registered') ||
        code.includes('invalid-registration-token') ||
        code.includes('invalid-argument')
      ) {
        stale.push(tokens[index]);
      }
    });

    if (stale.length > 0) {
      await this.prisma.device.updateMany({
        where: { deviceToken: { in: stale } },
        data: { deletedAt: new Date() },
      });
    }

    return {
      successCount: response.successCount,
      failureCount: response.failureCount,
      deviceCount: tokens.length,
      errors,
    };
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
