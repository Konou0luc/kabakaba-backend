import {
  CallHandler,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import { UserRole } from '@prisma/client';
import { Observable } from 'rxjs';
import {
  isStudentProfileAllowlisted,
  isStudentProfileComplete,
} from '../utils/student-profile';

/**
 * Bloque l’accès aux routes métier tant qu’un étudiant n’a pas renseigné
 * prénom + nom. Autorise GET /users/me, PATCH /users/:id (soi) et logout/refresh.
 */
@Injectable()
export class StudentProfileCompleteInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const req = context.switchToHttp().getRequest<{
      method: string;
      path?: string;
      url?: string;
      user?: {
        id: string;
        role: string;
        firstName?: string | null;
        lastName?: string | null;
      };
    }>();

    const user = req.user;
    if (!user || user.role !== UserRole.STUDENT) {
      return next.handle();
    }

    if (isStudentProfileComplete(user)) {
      return next.handle();
    }

    const path = req.path || req.url || '';
    if (isStudentProfileAllowlisted(req.method, path, user.id)) {
      return next.handle();
    }

    throw new ForbiddenException({
      statusCode: 403,
      code: 'PROFILE_SETUP_REQUIRED',
      message:
        'Complète ton profil (prénom et nom) avant d’accéder à kabakaba.',
    });
  }
}
