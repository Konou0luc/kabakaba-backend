import { Injectable, Logger, BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { HttpService } from '@nestjs/axios';
import { firstValueFrom } from 'rxjs';
import { AxiosResponse } from 'axios';

@Injectable()
export class FedapayService {
  private readonly logger = new Logger(FedapayService.name);
  private readonly secretKey: string;
  private readonly environment: string;
  private readonly baseUrl: string;

  constructor(
    private readonly configService: ConfigService,
    private readonly httpService: HttpService,
  ) {
    this.secretKey = this.configService.get<string>('FEDAPAY_SECRET_KEY') || '';
    this.environment = this.configService.get<string>('FEDAPAY_ENVIRONMENT') || '';
    this.baseUrl = this.configService.get<string>('FEDAPAY_BASE_URL') || '';
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
    try {
      const url = `${this.baseUrl}/v1/transactions/${transactionId}/start`;
      const payload = {
        transaction: {
          mode: 'mtn', // ou 'flooz' selon l'opérateur
          phone_number: phoneNumber,
          operator,
        },
      };

      const response: AxiosResponse<any> = await firstValueFrom(
        this.httpService.post(url, payload, { headers: this.getHeaders() }),
      );

      this.logger.log(
        `Paiement Mobile Money initié pour la transaction ${transactionId}`,
      );
      return response.data;
    } catch (error) {
      this.logger.error(
        `Erreur lors de l'initiation du paiement Mobile Money: ${error.message}`,
        error.stack,
      );
      throw new BadRequestException(
        'Erreur lors de l\'initiation du paiement',
      );
    }
  }
}
