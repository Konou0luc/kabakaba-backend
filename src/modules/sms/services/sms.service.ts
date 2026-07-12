import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { HttpService } from '@nestjs/axios';
import { firstValueFrom } from 'rxjs';

@Injectable()
export class SmsService {
  private readonly logger = new Logger(SmsService.name);
  private readonly apiKey: string;
  private readonly apiSecret: string;
  private readonly senderId: string;
  private readonly baseUrl: string;

  constructor(
    private readonly configService: ConfigService,
    private readonly httpService: HttpService,
  ) {
    this.apiKey = this.configService.get<string>('AFRIQSMS_API_KEY') || '';
    this.apiSecret = this.configService.get<string>('AFRIQSMS_API_SECRET') || '';
    this.senderId = this.configService.get<string>('AFRIQSMS_SENDER_ID') || '';
    this.baseUrl = this.configService.get<string>('AFRIQSMS_BASE_URL') || '';
  }

  async sendSms(recipient: string, message: string): Promise<any> {
    try {
      const url = `${this.baseUrl}/v1/sms/send`;
      const payload = {
        api_key: this.apiKey,
        api_secret: this.apiSecret,
        from: this.senderId,
        to: recipient,
        message,
      };

      const response = await firstValueFrom(
        this.httpService.post(url, payload),
      );

      this.logger.log(`SMS envoyé avec succès à ${recipient}`);
      return response.data;
    } catch (error) {
      this.logger.error(
        `Erreur lors de l'envoi du SMS à ${recipient}: ${error.message}`,
        error.stack,
      );
      throw error;
    }
  }

  async sendBulkSms(recipients: string[], message: string): Promise<any> {
    try {
      const url = `${this.baseUrl}/v1/sms/send-bulk`;
      const payload = {
        api_key: this.apiKey,
        api_secret: this.apiSecret,
        from: this.senderId,
        to: recipients,
        message,
      };

      const response = await firstValueFrom(
        this.httpService.post(url, payload),
      );

      this.logger.log(`SMS bulk envoyé avec succès à ${recipients.length} destinataires`);
      return response.data;
    } catch (error) {
      this.logger.error(
        `Erreur lors de l'envoi du SMS bulk: ${error.message}`,
        error.stack,
      );
      throw error;
    }
  }
}
