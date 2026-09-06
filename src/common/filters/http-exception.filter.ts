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
    const requestId = typeof request.headers['x-request-id'] === 'string'
      ? request.headers['x-request-id'].slice(0, 100)
      : crypto.randomUUID();

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
