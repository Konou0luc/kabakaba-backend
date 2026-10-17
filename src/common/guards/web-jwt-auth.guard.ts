import { ExecutionContext, Injectable } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { assertWebCsrf } from './assert-web-csrf';

@Injectable()
export class WebJwtAuthGuard extends AuthGuard('web-jwt') {
  async canActivate(context: ExecutionContext): Promise<boolean> {
    const authenticated = (await super.canActivate(context)) as boolean;
    if (!authenticated) return false;

    assertWebCsrf(context.switchToHttp().getRequest());
    return true;
  }
}
