import { Injectable, Logger, BadRequestException, InternalServerErrorException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { HttpService } from '@nestjs/axios';
import { firstValueFrom } from 'rxjs';
import { AxiosResponse } from 'axios';
import * as crypto from 'crypto';

@Injectable()
export class FedapayService {
  private readonly logger = new Logger(FedapayService.name);
  private readonly secretKey: string;
  private readonly baseUrl: string;
  private readonly webhookSecret: string;

  // Mapping opérateur Kabakaba -> "mode" attendu par l'API FedaPay
  private static readonly OPERATOR_TO_MODE: Record<string, string> = {
    FLOOZ: 'moov_tg', // Flooz = Moov Money Togo
    MIXX: 'togocel', // Mixx by Yas = ex-Togocel Money
  };

  constructor(
    private readonly configService: ConfigService,
    private readonly httpService: HttpService,
  ) {
    this.secretKey = this.configService.get<string>('FEDAPAY_SECRET_KEY') || '';
    this.baseUrl = this.configService.get<string>('FEDAPAY_BASE_URL') || '';
    this.webhookSecret = this.configService.get<string>('FEDAPAY_WEBHOOK_SECRET') || '';
  }

  private getHeaders() {
    return {
      Authorization: `Bearer ${this.secretKey}`,
      'Content-Type': 'application/json',
    };
  }

  async createTransaction(
    amount: number,
    currency: string,
    description: string,
    customer: { name: string; email?: string; phone?: string },
    metadata?: Record<string, any>,
  ): Promise<any> {
    try {
      const url = `${this.baseUrl}/v1/transactions`;
      const payload = {
        transaction: {
          amount,
          currency: { iso: currency },
          description,
          customer: {
            name: customer.name,
            email: customer.email || undefined,
            phone_number: customer.phone || undefined,
          },
          callback_url: `${this.configService.get('APP_URL')}/api/v1/payments/webhook`,
          metadata,
        },
      };

      const response: AxiosResponse<any> = await firstValueFrom(
        this.httpService.post(url, payload, { headers: this.getHeaders() }),
      );

      this.logger.log(
        `Transaction FedaPay créée avec succès: ${response.data.transaction.id}`,
      );
      return response.data;
    } catch (error) {
      this.logger.error(
        `Erreur lors de la création de la transaction FedaPay: ${error.message}`,
        error.stack,
      );
      throw new BadRequestException(
        'Erreur lors de la création de la transaction',
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
      this.logger.error(
        `Erreur lors de la récupération de la transaction FedaPay: ${error.message}`,
        error.stack,
      );
      throw new BadRequestException('Erreur lors de la récupération de la transaction');
    }
  }

  async initiateMobileMoneyPayment(
    transactionId: string,
    phoneNumber: string,
    operator: string,
  ): Promise<any> {
    const mode = FedapayService.OPERATOR_TO_MODE[operator];
    if (!mode) {
      throw new BadRequestException(
        `Opérateur de paiement non supporté par FedaPay: ${operator}`,
      );
    }

    // 1. Générer un token de paiement pour la transaction déjà créée
    let token: string | undefined;
    try {
      const tokenUrl = `${this.baseUrl}/v1/transactions/${transactionId}/token`;
      const tokenResponse: AxiosResponse<any> = await firstValueFrom(
        this.httpService.post(tokenUrl, {}, { headers: this.getHeaders() }),
      );
      token = tokenResponse.data?.token;
    } catch (error) {
      this.logger.error(
        `Erreur lors de la génération du token FedaPay: ${error.message}`,
        error.stack,
      );
      throw new BadRequestException(
        'Erreur lors de la génération du token de paiement',
      );
    }

    if (!token) {
      throw new BadRequestException(
        'Le token de paiement FedaPay est introuvable dans la réponse',
      );
    }

    // 2. Déclencher le débit Mobile Money directement (sans redirection)
    try {
      const chargeUrl = `${this.baseUrl}/v1/${mode}`;
      const payload = {
        token,
        phone_number: {
          number: phoneNumber,
          country: 'tg',
        },
      };

      const response: AxiosResponse<any> = await firstValueFrom(
        this.httpService.post(chargeUrl, payload, { headers: this.getHeaders() }),
      );

      this.logger.log(
        `Paiement Mobile Money initié pour la transaction ${transactionId} (mode: ${mode})`,
      );
      return response.data;
    } catch (error) {
      this.logger.error(
        `Erreur lors de l'initiation du paiement Mobile Money: ${error.message}`,
        error.stack,
      );
      throw new BadRequestException(
        "Erreur lors de l'initiation du paiement",
      );
    }
  }


  async createPayout(params: {
    amount: number;
    operator: 'FLOOZ' | 'MIXX';
    customer: { name: string; email?: string; phone: string };
    merchantReference: string;
  }): Promise<any> {
    if (!this.secretKey || !this.baseUrl) {
      throw new InternalServerErrorException('FedaPay payout non configuré');
    }

    const mode = params.operator === 'FLOOZ' ? 'moov_tg' : 'togocel';
    const url = `${this.baseUrl}/v1/payouts`;
    const payload = {
      amount: Math.trunc(params.amount),
      currency: { iso: 'XOF' },
      mode,
      description: `Retrait vendeur Kabakaba ${params.merchantReference}`,
      customer: {
        firstname: params.customer.name.split(' ')[0] || params.customer.name,
        lastname: params.customer.name.split(' ').slice(1).join(' ') || params.customer.name,
        email: params.customer.email || undefined,
        phone_number: { number: params.customer.phone, country: 'tg' },
      },
      merchant_reference: params.merchantReference,
      custom_metadata: {
        withdrawal_id: params.merchantReference,
        source: 'kabakaba',
      },
    };

    try {
      const response: AxiosResponse<any> = await firstValueFrom(
        this.httpService.post(url, payload, { headers: this.getHeaders() }),
      );
      return response.data;
    } catch (error) {
      this.logger.error(`Erreur création payout FedaPay: ${error.message}`, error.stack);
      throw new BadRequestException('Impossible de créer le payout FedaPay');
    }
  }

  async findPayoutByMerchantReference(merchantReference: string): Promise<any | null> {
    if (!this.secretKey || !this.baseUrl) {
      throw new InternalServerErrorException('FedaPay payout non configuré');
    }
    try {
      const url = `${this.baseUrl}/v1/payouts/merchant/${encodeURIComponent(merchantReference)}`;
      const response: AxiosResponse<any> = await firstValueFrom(
        this.httpService.get(url, { headers: this.getHeaders() }),
      );
      return response.data;
    } catch (error) {
      const status = error?.response?.status;
      if (status === 404) return null;
      this.logger.error(`Erreur recherche payout FedaPay: ${error.message}`, error.stack);
      throw new BadRequestException('Impossible de vérifier le payout FedaPay');
    }
  }

  async startPayout(payoutId: number, phone: string): Promise<any> {
    try {
      const url = `${this.baseUrl}/v1/payouts/start`;
      const response: AxiosResponse<any> = await firstValueFrom(
        this.httpService.put(
          url,
          [{ id: payoutId, phone_number: { number: phone, country: 'TG' } }],
          { headers: this.getHeaders() },
        ),
      );
      return Array.isArray(response.data) ? response.data[0] : response.data;
    } catch (error) {
      this.logger.error(`Erreur envoi payout FedaPay: ${error.message}`, error.stack);
      throw new BadRequestException('Impossible de démarrer le payout FedaPay');
    }
  }

  async getPayout(payoutId: number): Promise<any> {
    try {
      const url = `${this.baseUrl}/v1/payouts/${payoutId}`;
      const response: AxiosResponse<any> = await firstValueFrom(
        this.httpService.get(url, { headers: this.getHeaders() }),
      );
      return response.data;
    } catch (error) {
      this.logger.error(`Erreur récupération payout FedaPay: ${error.message}`, error.stack);
      throw new BadRequestException('Impossible de récupérer le payout FedaPay');
    }
  }

  /**
   * Vérifie la signature d'un webhook FedaPay (header X-FEDAPAY-SIGNATURE
   * au format "t=<timestamp>,s=<signature>", HMAC-SHA256 sur `${t}.${rawBody}`).
   * Lève une BadRequestException si la signature est absente, invalide, ou
   * si le timestamp est trop ancien (protection anti-rejeu).
   */
  private static readonly WEBHOOK_TOLERANCE_SECONDS = 5 * 60;

  verifyWebhookSignature(
    rawBody: string | Buffer,
    signatureHeader: string | undefined,
  ): void {
    const secret = this.webhookSecret;

    if (!secret) {
      // Fail-CLOSED : un webhook financier ne doit jamais être accepté
      // sans vérification de signature possible. Si le secret manque,
      // on rejette la requête au lieu de l'accepter en silence.
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

    // Anti-rejeu : le timestamp fait partie du message signé (il ne peut donc
    // pas être falsifié sans invalider la signature), on rejette s'il est
    // trop éloigné de l'heure serveur — qu'il soit trop vieux (webhook
    // intercepté et rejoué) ou dans le futur (horloge cliente incohérente).
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
      crypto.timingSafeEqual(Buffer.from(expectedSignature), Buffer.from(signature));

    if (!isValid) {
      throw new BadRequestException('Signature de webhook invalide');
    }
  }
}