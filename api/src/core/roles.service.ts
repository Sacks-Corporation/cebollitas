import { Injectable } from '@nestjs/common';
import { DataStoreService } from '../persistence/data-store.service';

export const ROLE_ADMIN = 'ADMIN';
export const ROLE_CEBOLLITAS = 'CEBOLLITAS';
export const ROLE_FUTBOL = 'FUTBOL';

export interface Identity {
  id?: string;
  email?: string | null;
}

/**
 * Port of `services/roles_service.py` + `admin_service.py`. The JWT only
 * carries id/email/name, so roles are always resolved from the store (by id,
 * falling back to email) instead of trusting the token.
 */
@Injectable()
export class RolesService {
  constructor(private readonly store: DataStoreService) {}

  async getUserRoles(user: Identity): Promise<string[]> {
    const users = await this.store.getAllowedUsers();
    const userId = user.id;
    const email = (user.email || '').toLowerCase();
    const match = users.find(
      (candidate) => (userId && candidate.id === userId) || (email && String(candidate.email).toLowerCase() === email),
    );
    return match ? [...(match.roles ?? [])] : [];
  }

  async hasRole(user: Identity, role: string): Promise<boolean> {
    return (await this.getUserRoles(user)).includes(role);
  }

  isAdmin(user: Identity): Promise<boolean> {
    return this.hasRole(user, ROLE_ADMIN);
  }
}
