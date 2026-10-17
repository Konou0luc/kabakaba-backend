import { ForbiddenException } from '@nestjs/common';
import type { Request } from 'express';

/**
 * Un vendeur créé par l'admin a un mot de passe temporaire
 * (`mustChangePassword`). Tant qu'il n'a pas terminé l'activation
 * (OTP + PIN, qui lève ce drapeau) ou changé ce mot de passe, le jeton
 * mobile ne doit servir qu'à POST /auth/change-password.
 */
export function assertMobileSessionUsable(req: Request): void {
  const user = req.user as
    | { __authKind?: string; mustChangePassword?: boolean }
    | undefined;
  if (!user || user.__authKind !== 'mobile' || !user.mustChangePassword) return;

  const url = req.originalUrl || req.url || '';
  const allowed = req.method === 'POST' && url.includes('/auth/change-password');
  if (!allowed) {
    throw new ForbiddenException(
      'Mot de passe temporaire encore actif. Changez-le avant d’utiliser l’application.',
    );
  }
}
