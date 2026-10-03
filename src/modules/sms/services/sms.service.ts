import { HttpService } from '@nestjs/axios';
import { Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AxiosError } from 'axios';
import { firstValueFrom } from 'rxjs';
import { maskPhone, safeErrorMessage } from '../../../common/utils/safe-log';

type AfriqSmsResponse = {
  code: number;
  message: string;
  resourceId?: string;
  data?: Array<{ phone: string; code: number; status: string; resourceId?: string }>;
  information?: Array<{ country: string; solde: number }>;
};

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
    this.clientId = this.configService.get<string>('AFRIQSMS_CLIENT_ID')?.trim() || '';
    this.apiKey = this.configService.get<string>('AFRIQSMS_API_KEY')?.trim() || '';
    this.senderId = this.configService.get<string>('AFRIQSMS_SENDER_ID')?.trim() || '';
    this.baseUrl = (
      this.configService.get<string>('AFRIQSMS_BASE_URL') || 'https://api.afriksms.com'
    ).replace(/\/+$/, '');
  }

  /** Converts regular E.164 input to the AfriqSMS digits-only format. */
  private normalizeRecipient(phone: string): string {
    const compact = phone.replace(/[\s().-]/g, '');
    const normalized = compact.startsWith('+')
      ? compact.slice(1)
      : compact.startsWith('00')
        ? compact.slice(2)
        : compact;

    if (!/^\d{8,15}$/.test(normalized)) {
      throw new ServiceUnavailableException('Le numéro de téléphone est invalide pour l’envoi SMS');
    }

    return normalized;
  }

  private assertConfiguration(): void {
    if (!this.clientId || !this.apiKey || !this.senderId) {
      this.logger.error('Configuration AfriqSMS incomplète (ClientId, ApiKey ou SenderId absent)');
      throw new ServiceUnavailableException('Le service SMS n’est pas configuré');
    }

    if (this.senderId.length > 11) {
      this.logger.error('AFRIQSMS_SENDER_ID dépasse la limite AfriqSMS de 11 caractères');
      throw new ServiceUnavailableException('Le service SMS n’est pas configuré');
    }
  }

  private form(fields: Record<string, string>): URLSearchParams {
    return new URLSearchParams(fields);
  }

  private handleProviderError(action: string, error: unknown): never {
    const axiosError = error as AxiosError<unknown>;
    const status = axiosError.response?.status;
    this.logger.error(
      `Échec AfriqSMS pendant ${action}${status ? ` (HTTP ${status})` : ''}: ${safeErrorMessage(error)}`,
    );
    throw new ServiceUnavailableException('L’envoi du SMS a échoué. Veuillez réessayer.');
  }

  async sendSms(recipient: string, message: string): Promise<AfriqSmsResponse> {
    this.assertConfiguration();
    const mobileNumber = this.normalizeRecipient(recipient);

    try {
      const response = await firstValueFrom(
        this.httpService.post<AfriqSmsResponse>(
          `${this.baseUrl}/api/web/web_v1/outbounds/send`,
          this.form({
            ClientId: this.clientId,
            ApiKey: this.apiKey,
            SenderId: this.senderId,
            Message: message,
            MobileNumbers: mobileNumber,
          }),
          { headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, timeout: 15_000 },
        ),
      );

      if (response.data.code !== 100) {
        this.logger.error(`AfriqSMS a refusé l’envoi: ${response.data.message}`);
        throw new ServiceUnavailableException('L’envoi du SMS a échoué. Veuillez réessayer.');
      }

      this.logger.log(`SMS AfriqSMS accepté pour ${maskPhone(mobileNumber)}`);
      return response.data;
    } catch (error) {
      if (error instanceof ServiceUnavailableException) throw error;
      return this.handleProviderError('l’envoi du SMS', error);
    }
  }
}
