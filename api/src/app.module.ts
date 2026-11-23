import { Module } from '@nestjs/common';
import { APP_FILTER } from '@nestjs/core';
import { FastApiExceptionFilter } from './common/http-exception.filter';
import { CoreModule } from './core/core.module';
import { AdminModule } from './modules/admin/admin.module';
import { AuthModule } from './modules/auth/auth.module';
import { CebollitasMatchesModule } from './modules/cebollitas-matches/cebollitas-matches.module';
import { EventsModule } from './modules/events/events.module';
import { HealthModule } from './modules/health/health.module';
import { MatchesModule } from './modules/matches/matches.module';
import { MonthlyEventsModule } from './modules/monthly-events/monthly-events.module';
import { RankingsModule } from './modules/rankings/rankings.module';
import { RolesModule } from './modules/roles/roles.module';
import { TripsModule } from './modules/trips/trips.module';
import { UsersModule } from './modules/users/users.module';
import { VotesModule } from './modules/votes/votes.module';
import { PersistenceModule } from './persistence/persistence.module';

@Module({
  imports: [
    PersistenceModule,
    CoreModule,
    AuthModule,
    UsersModule,
    RolesModule,
    MatchesModule,
    CebollitasMatchesModule,
    EventsModule,
    RankingsModule,
    MonthlyEventsModule,
    TripsModule,
    VotesModule,
    AdminModule,
    HealthModule,
  ],
  providers: [{ provide: APP_FILTER, useClass: FastApiExceptionFilter }],
})
export class AppModule {}
