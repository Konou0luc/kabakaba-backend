import { ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { timingSafeEqual } from 'crypto';
import { getCsrfCookie, getWebSessionToken } from '../utils/web-session-cookie';

@Injectable()
export class WebJwtAuthGuard extends AuthGuard('web-jwt') {
  async canActivate(context: ExecutionContext): Promise<boolean> {
    const authenticated = (await super.canActivate(context)) as boolean;
    if (!authenticated) return false;

    const req = context.switchToHttp().getRequest();
    if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) return true;
    // Flow tokens (onboarding/reset) are Bearer-only and do not reach this guard.
    if (!getWebSessionToken(req)) return true;

    const cookie = getCsrfCookie(req);
    const header = req.headers['x-csrf-token'];
    if (typeof header !== 'string' || !cookie) {
      throw new ForbiddenException('Protection CSRF requise');
    }
    const a = Buffer.from(header);
    const b = Buffer.from(cookie);
    if (a.length !== b.length || !timingSafeEqual(a, b)) {
      throw new ForbiddenException('Jeton CSRF invalide');
    }
    return true;
  }
}
