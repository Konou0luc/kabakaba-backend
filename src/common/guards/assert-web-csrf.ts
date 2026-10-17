import { ForbiddenException } from '@nestjs/common';
import { timingSafeEqual } from 'crypto';
import type { Request } from 'express';
import { getCsrfCookie, getWebSessionToken } from '../utils/web-session-cookie';

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

/**
 * Double-submit cookie pour les sessions web (cookie HttpOnly + cookie CSRF
 * lisible). En production le cookie de session est SameSite=None, parce que
 * le dashboard et l'API sont deux sites distincts : un formulaire d'un autre
 * site peut donc déclencher une mutation. Le jeton CSRF, lui, n'est pas
 * lisible par cet autre site.
 *
 * Les jetons d'étape (onboarding, reset) sont Bearer-only : pas de cookie
 * de session, donc pas de contrôle CSRF.
 */
export function assertWebCsrf(req: Request): void {
  if (SAFE_METHODS.has(req.method)) return;
  if (!getWebSessionToken(req)) return;

  const cookie = getCsrfCookie(req);
  const header = req.headers['x-csrf-token'];
  if (typeof header !== 'string' || !cookie) {
    throw new ForbiddenException('Protection CSRF requise');
  }

  const provided = Buffer.from(header);
  const expected = Buffer.from(cookie);
  if (provided.length !== expected.length || !timingSafeEqual(provided, expected)) {
    throw new ForbiddenException('Jeton CSRF invalide');
  }
}
