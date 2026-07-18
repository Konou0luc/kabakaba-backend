import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { HttpService } from '@nestjs/axios';
import { firstValueFrom } from 'rxjs';

@Injectable()
export class SmsService {
  private readonly logger = new Logger(SmsService.name);
  private readonly clientId: string;
  private readonly apiKey: string;
  private readonly senderId: string;
  private readonly baseUrl: string;

  constructor(
    private readonly configService: ConfigService,
    private readonly httpService: HttpService,
  ) {
    this.clientId = this.configService.get<string>('AFRIQSMS_CLIENT_ID') || '';
    this.apiKey = this.configService.get<string>('AFRIQSMS_API_KEY') || '';
    this.senderId = this.configService.get<string>('AFRIQSMS_SENDER_ID') || '';
    this.baseUrl = this.configService.get<string>('AFRIQSMS_BASE_URL') || '';
  }

  async sendSms(recipient: string, message: string): Promise<any> {
    try {
      const url = `${this.baseUrl}/api/web/v1/outbounds/send`;
      const payload = {
        clientId: this.clientId,
        apiKey: this.apiKey,
        senderId: this.senderId,
        message,
        mobileNumbers: recipient,
      };

      this.logger.debug(`Envoi SMS à ${recipient} via URL: ${url}`);

      const response = await firstValueFrom(
        this.httpService.post(url, payload),
      );

      this.logger.log(`SMS envoyé avec succès à ${recipient}: ${JSON.stringify(response.data)}`);
      return response.data;
    } catch (error) {
      this.logger.error(
        `Erreur lors de l'envoi du SMS à ${recipient}: ${error.message}`,
        error.response?.data || error.stack,
      );
      throw error;
    }
  }

  async sendBulkSms(recipients: string[], message: string): Promise<any> {
    try {
      const url = `${this.baseUrl}/api/web/v1/outbounds/send_multisms`;
      const payload = {
        clientId: this.clientId,
        apiKey: this.apiKey,
        senderId: this.senderId,
        message,
        mobileNumbers: recipients.join(','),
      };

      const response = await firstValueFrom(
        this.httpService.post(url, payload),
      );

      this.logger.log(`SMS bulk envoyé avec succès à ${recipients.length} destinataires`);
      return response.data;
    } catch (error) {
      this.logger.error(
        `Erreur lors de l'envoi du SMS bulk: ${error.message}`,
        error.response?.data || error.stack,
      );
      throw error;
    }
  }

  async getBalance(): Promise<any> {
    try {
      const url = `${this.baseUrl}/api/web/v1/outbounds/solde`;
      const payload = {
        clientId: this.clientId,
        apiKey: this.apiKey,
      };

      const response = await firstValueFrom(
        this.httpService.post(url, payload),
      );

      this.logger.log(`Solde AfriqSMS récupéré avec succès: ${JSON.stringify(response.data)}`);
      return response.data;
    } catch (error) {
      this.logger.error(
        `Erreur lors de la récupération du solde: ${error.message}`,
        error.response?.data || error.stack,
      );
      throw error;
    }
  }
}
