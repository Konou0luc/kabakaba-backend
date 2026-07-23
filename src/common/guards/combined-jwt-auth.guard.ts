import { ExecutionContext, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AuthGuard } from '@nestjs/passport';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator';

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

  canActivate(context: ExecutionContext) {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (isPublic) return true;

    return super.canActivate(context);
  }
}