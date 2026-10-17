import { ExecutionContext, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AuthGuard } from '@nestjs/passport';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator';
import { assertMobileCookieCsrf } from './assert-mobile-csrf';
import { assertMobileSessionUsable } from './assert-mobile-session';
import { assertWebCsrf } from './assert-web-csrf';

/**
 * Accepte soit un token mobile ('jwt'), soit un token web ('web-jwt').
 * Passport essaie les deux stratégies dans l'ordre et retient la première
 * qui valide — request.user sera un User (mobile) ou un WebUser (web),
 * distingué ensuite via __authKind (voir jwt.strategy.ts / web-jwt.strategy.ts).
 */
@Injectable()
export class CombinedJwtAuthGuard extends AuthGuard(['jwt', 'web-jwt']) {
  constructor(private reflector: Reflector) {
    super();
  }

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (isPublic) return true;

    const authenticated = (await super.canActivate(context)) as boolean;
    if (!authenticated) return false;

    const req = context.switchToHttp().getRequest();
    // Session dashboard (cookie) : même contrôle CSRF que WebJwtAuthGuard.
    // Sans ça, suspendre un compte, valider un retrait ou créer une cantine
    // était possible depuis un autre site, le cookie SameSite=None étant envoyé.
    if (req.user?.__authKind === 'web') {
      assertWebCsrf(req);
    }
    assertMobileCookieCsrf(req);
    assertMobileSessionUsable(req);
    return true;
  }
}