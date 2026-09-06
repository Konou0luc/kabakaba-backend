import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { UserRole, WebUserRole } from '@prisma/client';
import { ROLES_KEY } from '../decorators/roles.decorator';
import { WEB_ROLES_KEY } from '../decorators/web-roles.decorator';

/**
 * Sur une route protégée par CombinedJwtAuthGuard, vérifie le bon jeu de
 * rôles selon la provenance du token (mobile ou web), déterminée par
 * __authKind posé dans les stratégies JWT respectives.
 */
@Injectable()
export class CombinedRolesGuard implements CanActivate {
  constructor(private reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const requiredUserRoles = this.reflector.getAllAndOverride<UserRole[]>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    const requiredWebRoles = this.reflector.getAllAndOverride<WebUserRole[]>(WEB_ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    const { user } = context.switchToHttp().getRequest();
    if (!user) return false;

    if (user.__authKind === 'web') {
      if (requiredWebRoles) {
        return requiredWebRoles.some((role) => user.role === role);
      }
      // Compatibilité des routes historiques : UserRole.ADMIN ne représente
      // jamais un rôle mobile actif. Pour un token Web, il correspond à
      // WebUserRole.ADMIN.
      return user.role === WebUserRole.ADMIN &&
        Boolean(requiredUserRoles?.includes(UserRole.ADMIN));
    }

    if (!requiredUserRoles) return true;
    return requiredUserRoles.some((role) => user.role === role);
  }
}