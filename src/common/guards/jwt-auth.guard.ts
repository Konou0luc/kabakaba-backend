import { ExecutionContext, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AuthGuard } from '@nestjs/passport';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator';
import { assertMobileCookieCsrf } from './assert-mobile-csrf';
import { assertMobileSessionUsable } from './assert-mobile-session';

@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') {
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
    assertMobileCookieCsrf(req);
    assertMobileSessionUsable(req);
    return true;
  }
}
