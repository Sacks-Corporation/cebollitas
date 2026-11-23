import { Module } from '@nestjs/common';
import { CebollitasMatchesController } from './cebollitas-matches.controller';
import { CebollitasMatchesService } from './cebollitas-matches.service';

@Module({
  controllers: [CebollitasMatchesController],
  providers: [CebollitasMatchesService],
})
export class CebollitasMatchesModule {}
