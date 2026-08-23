import { Injectable, Logger, BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { HttpService } from '@nestjs/axios';
import { firstValueFrom } from 'rxjs';
import { AxiosResponse } from 'axios';
import * as crypto from 'crypto';

@Injectable()
export class FedapayService {
  private readonly logger = new Logger(FedapayService.name);
  private readonly secretKey: string;
  private readonly environment: string;
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
    this.environment = this.configService.get<string>('FEDAPAY_ENVIRONMENT') || '';
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

  /**
   * Vérifie la signature d'un webhook FedaPay (header X-FEDAPAY-SIGNATURE
   * au format "t=<timestamp>,s=<signature>", HMAC-SHA256 sur `${t}.${rawBody}`).
   * Lève une BadRequestException si la signature est absente ou invalide.
   */
  verifyWebhookSignature(
    rawBody: string | Buffer,
    signatureHeader: string | undefined,
  ): void {
    const secret = this.webhookSecret;

    if (!secret) {
      this.logger.warn(
        'FEDAPAY_WEBHOOK_SECRET non configuré : la signature du webhook n\'est PAS vérifiée. À corriger avant la mise en production.',
      );
      return;
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