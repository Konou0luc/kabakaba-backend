import { UserRole } from '@prisma/client';

export function isStudentProfileComplete(user: {
  role?: string | null;
  firstName?: string | null;
  lastName?: string | null;
}): boolean {
  if (user.role !== UserRole.STUDENT) return true;
  return Boolean(user.firstName?.trim() && user.lastName?.trim());
}

/** Routes autorisées tant que le profil étudiant (nom/prénom) est incomplet. */
export function isStudentProfileAllowlisted(
  method: string,
  path: string,
  userId: string,
): boolean {
  const normalized = path.split('?')[0].replace(/\/+$/, '') || '/';
  const m = method.toUpperCase();

  if (m === 'GET' && (normalized === '/users/me' || normalized.endsWith('/users/me'))) {
    return true;
  }

  // PATCH /users/:id — uniquement son propre profil
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

  return false;
}
