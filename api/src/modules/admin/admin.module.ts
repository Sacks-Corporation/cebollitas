import { Module } from '@nestjs/common';
import { MonthlyEventsModule } from '../monthly-events/monthly-events.module';
import { AdminController } from './admin.controller';

@Module({
  imports: [MonthlyEventsModule],
  controllers: [AdminController],
})
export class AdminModule {}
