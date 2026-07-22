import { SetMetadata } from '@nestjs/common';
import { WebUserRole } from '@prisma/client';

export const WEB_ROLES_KEY = 'webRoles';
export const WebRoles = (...roles: WebUserRole[]) => SetMetadata(WEB_ROLES_KEY, roles);
