import { Module } from '@nestjs/common';
import { RankingsController } from './rankings.controller';

@Module({
  controllers: [RankingsController],
})
export class RankingsModule {}
