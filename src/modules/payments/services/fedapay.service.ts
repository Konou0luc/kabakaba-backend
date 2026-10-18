import {
  Injectable,
  Logger,
  BadRequestException,
  InternalServerErrorException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { HttpService } from '@nestjs/axios';
import { firstValueFrom } from 'rxjs';
import { AxiosResponse } from 'axios';
import * as crypto from 'crypto';

type FedapayEnv = 'live' | 'sandbox' | 'development';

@Injectable()
export class FedapayService {
  private readonly logger = new Logger(FedapayService.name);
  private readonly secretKey: string;
  private readonly baseUrl: string;
  private readonly webhookSecret: string;
  private readonly environment: FedapayEnv;

  /**
   * Mapping opérateur Kabakaba → mode FedaPay.
   * - FLOOZ (Moov Togo) → `moov_tg`
   * - MIXX (Mixx by Yas) → `mtn_open`
   *
   * Note : la doc publique cite parfois `togocel`, mais sur le compte live
   * Kabakaba `POST /v1/togocel` renvoie 400 « Opération non autorisée ».
   * `POST /v1/mtn_open` répond 200 (vérifié 2026-10-18). Aligné Adèle Delices.
   */
  private static readonly OPERATOR_TO_MODE: Record<string, string> = {
    FLOOZ: 'moov_tg',
    MIXX: 'mtn_open',
  };

  /** Expose le mode FedaPay pour un opérateur Kabakaba. */
  resolveMode(operator: string): string {
    const mode = FedapayService.OPERATOR_TO_MODE[operator];
    if (!mode) {
      throw new BadRequestException(
        `Opérateur de paiement non supporté par FedaPay: ${operator}`,
      );
    }
    return mode;
  }

  constructor(
    private readonly configService: ConfigService,
    private readonly httpService: HttpService,
  ) {
    this.secretKey = (this.configService.get<string>('FEDAPAY_SECRET_KEY') || '').trim();
    this.webhookSecret = (
      this.configService.get<string>('FEDAPAY_WEBHOOK_SECRET') || ''
    ).trim();
    this.environment = resolveFedapayEnvironment(
      this.configService.get<string>('FEDAPAY_ENVIRONMENT'),
      this.secretKey,
    );
    this.baseUrl = resolveFedapayBaseUrl(
      this.configService.get<string>('FEDAPAY_BASE_URL'),
      this.environment,
      this.secretKey,
    );

    this.logger.log(
      `FedaPay prêt · env=${this.environment} · base=${this.baseUrl || '(manquant)'} · key=${
        this.secretKey ? `${this.secretKey.slice(0, 8)}…` : '(manquant)'
      }`,
    );
    if (!this.webhookSecret) {
      this.logger.warn(
        'FEDAPAY_WEBHOOK_SECRET manquant — les webhooks seront rejetés (fail-closed).',
      );
    }
  }

  private getHeaders() {
    return {
      Authorization: `Bearer ${this.secretKey}`,
      'Content-Type': 'application/json',
      Accept: 'application/json',
    };
  }

  async createTransaction(
    amount: number,
    currency: string,
    description: string,
    customer: { name: string; email?: string; phone?: string },
    metadata?: Record<string, any>,
    operator?: string,
  ): Promise<any> {
    if (!this.secretKey || !this.baseUrl) {
      throw new InternalServerErrorException('FedaPay n’est pas configuré');
    }

    const { firstname, lastname } = splitCustomerName(customer.name);
    // Client : E.164 accepté à la création ; le push MM utilise le format national.
    const phoneNumber = toFedapayCustomerPhone(customer.phone);
    // callback_url = URL de retour navigateur (pas le webhook signé).
    // Pour le push Mobile Money on peut l’omettre ; sinon page publique app.
    const returnUrl = (
      this.configService.get<string>('FEDAPAY_RETURN_URL') ||
      this.configService.get<string>('APP_PUBLIC_URL') ||
      ''
    )
      .trim()
      .replace(/\/$/, '');

    const payload: Record<string, unknown> = {
      description,
      amount: Math.trunc(amount),
      currency: { iso: currency },
      customer: {
        firstname,
        lastname,
        email: customer.email?.includes('@')
          ? customer.email
          : fallbackStudentEmail(customer.phone),
        ...(phoneNumber ? { phone_number: phoneNumber } : {}),
      },
      custom_metadata: metadata,
    };
    // Mode dès la création (recommandé FedaPay pour le flux sans redirection).
    if (operator) {
      payload.mode = this.resolveMode(operator);
    }
    if (returnUrl) {
      payload.callback_url = returnUrl;
    }

    try {
      const url = `${this.baseUrl}/v1/transactions`;
      const response: AxiosResponse<any> = await firstValueFrom(
        this.httpService.post(url, payload, { headers: this.getHeaders() }),
      );
      const transaction =
        response.data?.transaction ?? response.data?.['v1/transaction'];
      if (!transaction?.id) {
        this.logger.error(
          `Réponse FedaPay sans id: ${JSON.stringify(response.data)}`,
        );
        throw new BadRequestException(
          'Erreur lors de la création de la transaction',
        );
      }
      this.logger.log(`Transaction FedaPay créée: ${transaction.id}`);
      return { ...response.data, transaction };
    } catch (error) {
      if (error instanceof BadRequestException) throw error;
      const detail = fedapayErrorDetail(error);
      this.logger.error(`Erreur création transaction FedaPay: ${detail}`);
      throw new BadRequestException(
        friendlyFedapayMessage(detail, 'Impossible de créer le paiement'),
      );
    }
  }

  async getTransaction(id: string): Promise<any> {
    try {
      const url = `${this.baseUrl}/v1/transactions/${id}`;
      const response: AxiosResponse<any> = await firstValueFrom(
        this.httpService.get(url, { headers: this.getHeaders() }),
      );
      return response.data;
    } catch (error) {
      const detail = fedapayErrorDetail(error);
      this.logger.error(`Erreur récupération transaction FedaPay: ${detail}`);
      throw new BadRequestException(
        'Erreur lors de la récupération de la transaction',
      );
    }
  }

  async initiateMobileMoneyPayment(
    transactionId: string,
    phoneNumber: string,
    operator: string,
  ): Promise<any> {
    if (!transactionId) {
      throw new BadRequestException('Référence de transaction manquante');
    }

    const mode = this.resolveMode(operator);

    let token: string | undefined;
    try {
      const tokenUrl = `${this.baseUrl}/v1/transactions/${transactionId}/token`;
      const tokenResponse: AxiosResponse<any> = await firstValueFrom(
        this.httpService.post(tokenUrl, {}, { headers: this.getHeaders() }),
      );
      token =
        tokenResponse.data?.token ||
        tokenResponse.data?.payment_token?.token ||
        tokenResponse.data?.['v1/token']?.token;
    } catch (error) {
      const detail = fedapayErrorDetail(error);
      this.logger.error(`Erreur token FedaPay: ${detail}`);
      throw new BadRequestException(
        friendlyFedapayMessage(detail, 'Impossible de préparer le paiement'),
      );
    }

    if (!token) {
      throw new BadRequestException(
        'Le token de paiement FedaPay est introuvable dans la réponse',
      );
    }

    // Docs FedaPay (paiement sans redirection) :
    // phone_number: { number: "70341309", country: "tg" }  ← national, SANS +228
    // https://docs.fedapay.com/fr/integration-api/collects-management
    const chargePhone = toFedapayChargePhone(phoneNumber);
    if (!chargePhone) {
      throw new BadRequestException('Numéro Mobile Money invalide');
    }

    try {
      // POST /v1/togocel ou /v1/moov_tg
      // Format doc FedaPay : { number: "70341309", country: "tg" } (national)
      const chargeUrl = `${this.baseUrl}/v1/${mode}`;
      const payload = {
        token,
        phone_number: chargePhone,
      };

      this.logger.log(
        `FedaPay charge → ${chargeUrl} phone=${JSON.stringify(chargePhone)} op=${operator}`,
      );

      const response: AxiosResponse<any> = await firstValueFrom(
        this.httpService.post(chargeUrl, payload, { headers: this.getHeaders() }),
      );

      const body = response.data || {};
      // Erreur métier explicite même en HTTP 2xx.
      const softError = body?.error || body?.errors;
      if (softError) {
        const detail =
          typeof softError === 'string' ? softError : JSON.stringify(softError);
        this.logger.error(
          `FedaPay charge soft-fail txn=${transactionId} mode=${mode}: ${detail}`,
        );
        throw new BadRequestException(
          friendlyFedapayMessage(
            detail,
            "Impossible d'envoyer la demande Mobile Money. Vérifie le numéro et l'opérateur.",
          ),
        );
      }

      this.logger.log(
        `Paiement MM initié txn=${transactionId} mode=${mode} op=${operator} phone_fmt=national:***${chargePhone.number.slice(-4)}`,
      );
      return body;
    } catch (error) {
      if (error instanceof BadRequestException) throw error;
      const detail = fedapayErrorDetail(error);
      this.logger.error(
        `Erreur initiation MM FedaPay txn=${transactionId} mode=${mode} phone_fmt=national:***${chargePhone.number.slice(-4)}: ${detail}`,
      );
      throw new BadRequestException(
        friendlyFedapayMessage(
          detail,
          "Impossible d'envoyer la demande Mobile Money. Vérifie le numéro et réessaie.",
        ),
      );
    }
  }

  private static readonly WEBHOOK_TOLERANCE_SECONDS = 5 * 60;

  verifyWebhookSignature(
    rawBody: string | Buffer,
    signatureHeader: string | undefined,
  ): void {
    const secret = this.webhookSecret;

    if (!secret) {
      this.logger.error(
        'FEDAPAY_WEBHOOK_SECRET non configuré : webhook rejeté (fail-closed).',
      );
      throw new InternalServerErrorException(
        'Configuration serveur incomplète : webhook refusé',
      );
    }

    if (!signatureHeader) {
      throw new BadRequestException('Signature de webhook manquante');
    }

    const payload = Buffer.isBuffer(rawBody) ? rawBody.toString('utf8') : rawBody;

    const { timestamp, signature } = signatureHeader.split(',').reduce(
      (acc, part) => {
        const [key, value] = part.split('=');
        if (key === 't') acc.timestamp = value;
        if (key === 's') acc.signature = value;
        return acc;
      },
      { timestamp: '', signature: '' },
    );

    if (!timestamp || !signature) {
      throw new BadRequestException('Format de signature de webhook invalide');
    }

    const timestampSeconds = Number(timestamp);
    if (!Number.isFinite(timestampSeconds)) {
      throw new BadRequestException('Format de signature de webhook invalide');
    }

    const nowSeconds = Math.floor(Date.now() / 1000);
    const skewSeconds = Math.abs(nowSeconds - timestampSeconds);
    if (skewSeconds > FedapayService.WEBHOOK_TOLERANCE_SECONDS) {
      throw new BadRequestException('Webhook expiré (timestamp hors tolérance)');
    }

    const expectedSignature = crypto
      .createHmac('sha256', secret)
      .update(`${timestamp}.${payload}`, 'utf8')
      .digest('hex');

    const isValid =
      expectedSignature.length === signature.length &&
      crypto.timingSafeEqual(
        Buffer.from(expectedSignature),
        Buffer.from(signature),
      );

    if (!isValid) {
      throw new BadRequestException('Signature de webhook invalide');
    }
  }
}

function normalizeEnvironment(value?: string): FedapayEnv | null {
  // Tolère les .env mal formés du type: sandbox" # ou "live
  const normalized = (value || '')
    .trim()
    .replace(/^["']|["'].*$/g, '')
    .toLowerCase();
  if (!normalized) return null;
  if (normalized === 'live' || normalized === 'production') return 'live';
  if (normalized === 'development' || normalized === 'dev') return 'development';
  if (normalized === 'sandbox' || normalized === 'test') return 'sandbox';
  return null;
}

function resolveFedapayEnvironment(
  configured: string | undefined,
  secretKey: string,
): FedapayEnv {
  const fromKey = secretKey.startsWith('sk_live')
    ? 'live'
    : secretKey.startsWith('sk_sandbox') || secretKey.startsWith('sk_test')
      ? 'sandbox'
      : null;
  const fromEnv = normalizeEnvironment(configured);
  // La clé prime : sk_live ne doit jamais frapper sandbox-api.
  if (fromKey) return fromKey;
  return fromEnv || 'sandbox';
}

function resolveFedapayBaseUrl(
  configured: string | undefined,
  environment: FedapayEnv,
  secretKey: string,
): string {
  const explicit = (configured || '').trim().replace(/\/$/, '');
  const fromEnv =
    environment === 'live'
      ? 'https://api.fedapay.com'
      : environment === 'development'
        ? 'https://dev-api.fedapay.com'
        : 'https://sandbox-api.fedapay.com';

  if (!explicit) return fromEnv;

  // Garde-fou : clé live + URL sandbox (ou l’inverse) → forcer l’URL cohérente.
  const isSandboxHost = /sandbox-api\.fedapay\.com/i.test(explicit);
  const isLiveHost = /(?:^|\/\/)api\.fedapay\.com/i.test(explicit);
  if (secretKey.startsWith('sk_live') && isSandboxHost) {
    return 'https://api.fedapay.com';
  }
  if (
    (secretKey.startsWith('sk_sandbox') || secretKey.startsWith('sk_test')) &&
    isLiveHost
  ) {
    return 'https://sandbox-api.fedapay.com';
  }
  return explicit;
}

function splitCustomerName(name: string): { firstname: string; lastname: string } {
  const parts = (name || '').trim().split(/\s+/).filter(Boolean);
  return {
    firstname: parts[0] || 'Etudiant',
    lastname: parts.slice(1).join(' ') || 'Kabakaba',
  };
}

/**
 * Client à la création de transaction (docs FedaPay) :
 * `{ number: "+228XXXXXXXX", country: "tg" }`.
 */
function toFedapayCustomerPhone(
  phone?: string,
): { number: string; country: 'tg' } | undefined {
  if (!phone) return undefined;
  const digits = phone.replace(/\D/g, '');
  const withCountry = digits.startsWith('228') ? digits : `228${digits}`;
  const national = withCountry.slice(3);
  if (national.length < 8 || national.length > 10) return undefined;
  return { number: `+${withCountry}`, country: 'tg' };
}

/**
 * Push Mobile Money : national Togo `70341309` + country `tg`.
 * (mtn_open accepte aussi +228… ; on normalise en national pour homogénéité.)
 */
function toFedapayChargePhone(
  phone?: string,
): { number: string; country: 'tg' } | undefined {
  if (!phone) return undefined;
  const digits = phone.replace(/\D/g, '');
  const national = digits.startsWith('228') ? digits.slice(3) : digits;
  if (national.length < 8 || national.length > 10) return undefined;
  return { number: national, country: 'tg' };
}

function fallbackStudentEmail(phone?: string): string {
  const digits = (phone || 'unknown').replace(/\D/g, '') || 'unknown';
  return `etudiant.${digits}@kabakaba.app`;
}

function fedapayErrorDetail(error: unknown): string {
  const ax = error as {
    message?: string;
    response?: { status?: number; data?: unknown };
  };
  const data = ax.response?.data;
  const body =
    typeof data === 'string'
      ? data
      : data
        ? JSON.stringify(data)
        : '';
  return [ax.response?.status, ax.message, body].filter(Boolean).join(' ');
}

function friendlyFedapayMessage(detail: string, fallback: string): string {
  const lower = detail.toLowerCase();
  if (/401|unauthorized|invalid.?api.?key|authentication/i.test(lower)) {
    return 'Configuration FedaPay invalide (clé / environnement). Contacte le support.';
  }
  if (/op[eé]ration non autoris|not.?authorized|forbidden/i.test(lower)) {
    return 'Cet opérateur n’est pas activé sur FedaPay. Contacte le support Kabakaba.';
  }
  if (/404|mode.?not.?found|unknown.?mode/i.test(lower)) {
    return 'Opérateur Mobile Money indisponible pour le moment.';
  }
  if (/phone|numéro|number/i.test(lower)) {
    return 'Numéro Mobile Money refusé. Vérifie le numéro et réessaie.';
  }
  if (/429|too many|rate/i.test(lower)) {
    return 'Trop de tentatives. Réessaie dans un instant.';
  }
  return fallback;
}
