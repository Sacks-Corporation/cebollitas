import { list, opt } from '../../common/serialize';
import { Dict } from '../../persistence/data-store.service';

/** `User` response model. */
export function serializeUser(user: Dict) {
  return { id: user.id, name: user.name, email: user.email, roles: list(user.roles) };
}

/** `Role` response model. */
export function serializeRole(role: Dict) {
  return { id: role.id, name: role.name, description: opt(role.description) };
}

/** `UserRef` response model. */
export function serializeUserRef(user: Dict) {
  return { id: user.id, name: user.name };
}
