import { UserRole } from '@prisma/client';

export function isStudentProfileComplete(user: {
  role?: string | null;
  firstName?: string | null;
  lastName?: string | null;
}): boolean {
  if (user.role !== UserRole.STUDENT) return true;
  return Boolean(user.firstName?.trim() && user.lastName?.trim());
}

/** Normalise le chemin (retire query + préfixe /api/v1). */
export function normalizeApiPath(path: string): string {
  const bare = (path || '').split('?')[0].replace(/\/+$/, '') || '/';
  return bare.replace(/^\/api\/v\d+/, '') || '/';
}

/** Routes autorisées tant que le profil étudiant (nom/prénom) est incomplet. */
export function isStudentProfileAllowlisted(
  method: string,
  path: string,
  userId: string,
): boolean {
  const normalized = normalizeApiPath(path);
  const m = method.toUpperCase();

  if (m === 'GET' && (normalized === '/users/me' || normalized.endsWith('/users/me'))) {
    return true;
  }

  // PATCH /users/:id — uniquement son propre profil (compléter nom/prénom)
  const selfPatch = normalized.match(/^\/users\/([^/]+)$/);
  if (m === 'PATCH' && selfPatch && selfPatch[1] === userId) {
    return true;
  }

  if (
    m === 'POST' &&
    (normalized.endsWith('/auth/logout') ||
      normalized.endsWith('/auth/refresh') ||
      normalized.endsWith('/auth/refresh-token'))
  ) {
    return true;
  }

  // Push FCM : enregistrer / lister / retirer le token même avant profil complet.
  if (
    normalized === '/devices' ||
    normalized.endsWith('/devices')
  ) {
    if (m === 'GET' || m === 'POST' || m === 'DELETE') return true;
  }

  return false;
}
