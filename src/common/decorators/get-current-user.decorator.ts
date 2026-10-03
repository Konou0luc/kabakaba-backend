import { createParamDecorator, ExecutionContext } from '@nestjs/common';

export const GetCurrentUserId = createParamDecorator(
  (_: undefined, context: ExecutionContext) => {
    const request = context.switchToHttp().getRequest();
    // request.user est l'objet User renvoyé par JwtStrategy.validate() (pas le
    // payload JWT brut) — il expose `.id`, pas `.sub`.
    return request.user.id;
  },
);
