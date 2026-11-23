import { Module } from '@nestjs/common';
import { VotesController } from './votes.controller';

@Module({
  controllers: [VotesController],
})
export class VotesModule {}
