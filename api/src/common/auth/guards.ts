import { applyDecorators, CanActivate, ExecutionContext, Injectable, SetMetadata, UseGuards } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';
import { ROLE_ADMIN, RolesService } from '../../core/roles.service';
import { httpError } from '../http-errors';
import { decodeAccessToken } from './tokens';

/**
 * Port of `dependencies.get_current_user` on top of FastAPI's `HTTPBearer`:
 * - no/malformed header -> 403 "Not authenticated"
 * - non-Bearer scheme -> 403 "Invalid authentication credentials"
 * - bad/expired token -> 401 "Token inválido."
 */
@Injectable()
export class JwtAuthGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<Request & { user?: unknown }>();
    const authorization = request.headers.authorization;
    const [scheme, credentials] = partitionScheme(authorization);
    if (!(authorization && scheme && credentials)) throw httpError(403, 'Not authenticated');
    if (scheme.toLowerCase() !== 'bearer') throw httpError(403, 'Invalid authentication credentials');
    try {
      const payload = decodeAccessToken(credentials);
      if (payload.userId === undefined || payload.email === undefined || payload.name === undefined) {
        throw new Error('Incomplete token payload');
      }
      request.user = { id: payload.userId, email: payload.email, name: payload.name };
    } catch {
      throw httpError(401, 'Token inválido.');
    }
    return true;
  }
}

/** FastAPI's `get_authorization_scheme_param`: `value.partition(" ")`. */
function partitionScheme(value: string | undefined): [string, string] {
  if (!value) return ['', ''];
  const index = value.indexOf(' ');
  if (index === -1) return [value, ''];
  return [value.slice(0, index), value.slice(index + 1)];
}

/** Port of `dependencies.get_admin_user`. */
@Injectable()
export class AdminGuard implements CanActivate {
  constructor(private readonly roles: RolesService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const user = context.switchToHttp().getRequest().user;
    if (!(await this.roles.isAdmin(user))) throw httpError(403, 'Acceso de admin requerido.');
    return true;
  }
}

const ROLES_KEY = 'auth:roles';
interface RolesRequirement {
  mode: 'any' | 'all';
  roles: string[];
}

/** Port of `roles_service.require_roles` / `require_all_roles` (ADMIN always passes). */
@Injectable()
export class RolesGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly roles: RolesService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const requirement = this.reflector.getAllAndOverride<RolesRequirement | undefined>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!requirement) return true;
    const user = context.switchToHttp().getRequest().user;
    const userRoles = await this.roles.getUserRoles(user);
    const check = requirement.mode === 'all' ? 'every' : 'some';
    if (!userRoles.includes(ROLE_ADMIN) && !requirement.roles[check]((role) => userRoles.includes(role))) {
      throw httpError(403, 'No tenés permiso para realizar esta acción.');
    }
    return true;
  }
}

/** Requires a valid JWT (`Depends(get_current_user)`). */
export const Authenticated = () => UseGuards(JwtAuthGuard);

/** Requires the ADMIN role (`Depends(get_admin_user)`). */
export const AdminOnly = () => UseGuards(JwtAuthGuard, AdminGuard);

/** Requires any of `roles` (`Depends(require_roles(...))`). */
export const RequireRoles = (...roles: string[]) =>
  applyDecorators(SetMetadata(ROLES_KEY, { mode: 'any', roles }), UseGuards(JwtAuthGuard, RolesGuard));

/** Requires all of `roles` (`Depends(require_all_roles(...))`). */
export const RequireAllRoles = (...roles: string[]) =>
  applyDecorators(SetMetadata(ROLES_KEY, { mode: 'all', roles }), UseGuards(JwtAuthGuard, RolesGuard));
