import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { timingSafeEqual } from 'crypto';
import { getCsrfCookie } from '../utils/web-session-cookie';

@Injectable()
export class WebCsrfGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest();
    if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) return true;
    // Onboarding/reset use short-lived Bearer flow tokens, not the session cookie.
    if (!getCsrfCookie(req)) return true;
    const header = req.headers['x-csrf-token'];
    const cookie = getCsrfCookie(req);
    if (typeof header !== 'string' || !cookie) throw new ForbiddenException('Protection CSRF requise');
    const a = Buffer.from(header);
    const b = Buffer.from(cookie);
    if (a.length !== b.length || !timingSafeEqual(a, b)) throw new ForbiddenException('Jeton CSRF invalide');
    return true;
  }
}
