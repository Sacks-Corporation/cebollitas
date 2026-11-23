import { Module } from '@nestjs/common';
import { MonthlyEventsController } from './monthly-events.controller';
import { MonthlyEventsService } from './monthly-events.service';

@Module({
  controllers: [MonthlyEventsController],
  providers: [MonthlyEventsService],
  exports: [MonthlyEventsService],
})
export class MonthlyEventsModule {}
