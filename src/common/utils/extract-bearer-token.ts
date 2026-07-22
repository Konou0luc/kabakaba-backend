import { UnauthorizedException } from '@nestjs/common';

export function extractBearerToken(authorizationHeader?: string): string {
  if (!authorizationHeader?.startsWith('Bearer ')) {
    throw new UnauthorizedException('En-tête Authorization manquant (Bearer token requis)');
  }
  return authorizationHeader.slice('Bearer '.length);
}
