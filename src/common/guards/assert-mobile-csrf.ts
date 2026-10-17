import { ForbiddenException } from '@nestjs/common';
import { timingSafeEqual } from 'crypto';
import type { Request } from 'express';
import {
  getMobileAccessCookie,
  getMobileCsrfCookie,
  getMobileRefreshCookie,
  mobileAppFromRequest,
} from '../utils/mobile-session-cookie';

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

/**
 * Session PWA en cookie HttpOnly. Le jeton n'est plus lisible par le script
 * de la page. Comme le cookie est SameSite=None quand la PWA et l'API sont
 * deux sites distincts, chaque mutation doit renvoyer le jeton CSRF.
 */
export function assertMobileCookieCsrf(req: Request): void {
  if (SAFE_METHODS.has(req.method)) return;

  const app = mobileAppFromRequest(req);
  if (!app) return;
  if (!getMobileAccessCookie(req, app) && !getMobileRefreshCookie(req, app)) return;

  const cookie = getMobileCsrfCookie(req, app);
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
