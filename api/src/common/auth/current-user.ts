import { createParamDecorator, ExecutionContext } from '@nestjs/common';

/** Identity carried by the JWT (roles are always resolved from the store). */
export interface CurrentUserData {
  id: string;
  email: string;
  name: string;
}

export const CurrentUser = createParamDecorator((_data: unknown, ctx: ExecutionContext): CurrentUserData => {
  return ctx.switchToHttp().getRequest().user;
});
