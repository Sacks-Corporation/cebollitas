import { Controller, Get } from '@nestjs/common';
import { CurrentUser, CurrentUserData } from '../../common/auth/current-user';
import { Authenticated } from '../../common/auth/guards';
import { DataStoreService } from '../../persistence/data-store.service';
import { serializeUser } from './users.schemas';

@Controller('api')
export class UsersController {
  constructor(private readonly store: DataStoreService) {}

  @Get('users')
  @Authenticated()
  async listUsers() {
    return (await this.store.getAllowedUsers()).map(serializeUser);
  }

  @Get('me')
  @Authenticated()
  async me(@CurrentUser() currentUser: CurrentUserData) {
    // The JWT identity only carries id/email/name, so resolve the stored user to
    // include roles. Fall back to the token identity if not found.
    const stored = (await this.store.getAllowedUsers()).find((user) => user.id === currentUser.id);
    return serializeUser(stored ?? currentUser);
  }
}
