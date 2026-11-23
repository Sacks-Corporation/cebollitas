import { Controller, Get } from '@nestjs/common';
import { Authenticated } from '../../common/auth/guards';
import { DataStoreService } from '../../persistence/data-store.service';
import { serializeRole } from '../users/users.schemas';

@Controller('api')
export class RolesController {
  constructor(private readonly store: DataStoreService) {}

  @Get('roles')
  @Authenticated()
  async listRoles() {
    return (await this.store.getRoles()).map(serializeRole);
  }
}
