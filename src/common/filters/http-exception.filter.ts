import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Request, Response } from 'express';
import * as crypto from 'crypto';
import { safeErrorMessage } from '../utils/safe-log';

@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger(AllExceptionsFilter.name);

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();
    // Ne jamais faire confiance au request-id fourni par le client pour
    // l'identité de corrélation côté serveur. On génère systématiquement
    // un identifiant imprévisible et on l'expose dans la réponse/logs.
    const requestId = crypto.randomUUID();
    response.setHeader('X-Request-Id', requestId);

    const status = exception instanceof HttpException
      ? exception.getStatus()
      : HttpStatus.INTERNAL_SERVER_ERROR;

    if (!(exception instanceof HttpException) || status >= 500) {
      this.logger.error(`HTTP ${status} ${request.method} ${request.url} [${requestId}]: ${safeErrorMessage(exception)}`);
    }

    if (exception instanceof HttpException) {
      const body = exception.getResponse();
      response.status(status).json({
        ...(typeof body === 'object' && body !== null ? body : { message: body }),
        timestamp: new Date().toISOString(),
        path: request.url,
        requestId,
      });
      return;
    }

    // Ne jamais renvoyer le message d'une exception interne (Prisma, DB,
    // fournisseur externe, stack applicative, etc.) au client.
    response.status(HttpStatus.INTERNAL_SERVER_ERROR).json({
      statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
      message: 'Une erreur interne est survenue',
      timestamp: new Date().toISOString(),
      path: request.url,
      requestId,
    });
  }
}
