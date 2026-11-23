import { Global, Module } from '@nestjs/common';
import { AdminGuard, JwtAuthGuard, RolesGuard } from '../common/auth/guards';
import { ImageService } from './image.service';
import { RolesService } from './roles.service';
import { VoteService } from './vote.service';

/** Cross-cutting services shared by feature modules (roles, votes, images, guards). */
@Global()
@Module({
  providers: [RolesService, VoteService, ImageService, JwtAuthGuard, AdminGuard, RolesGuard],
  exports: [RolesService, VoteService, ImageService, JwtAuthGuard, AdminGuard, RolesGuard],
})
export class CoreModule {}
