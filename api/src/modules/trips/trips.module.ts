import { Module } from '@nestjs/common';
import { TripsController } from './trips.controller';

@Module({
  controllers: [TripsController],
})
export class TripsModule {}
