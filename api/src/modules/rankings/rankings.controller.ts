import { Controller, Get } from '@nestjs/common';
import { Authenticated } from '../../common/auth/guards';
import { computeRankings, RankingRow } from '../../core/scoring';
import { VoteService } from '../../core/vote.service';
import { DataStoreService } from '../../persistence/data-store.service';

@Controller('api')
export class RankingsController {
  constructor(
    private readonly store: DataStoreService,
    private readonly votes: VoteService,
  ) {}

  @Get('rankings')
  @Authenticated()
  async rankings(): Promise<RankingRow[]> {
    const users = await this.store.getAllowedUsers();
    const events = await this.store.eventsRepo.read();
    const trips = await this.store.tripsRepo.read();
    return computeRankings(
      users,
      events,
      trips,
      await this.votes.getVoteAveragesByEvent(),
      await this.store.getCebollitasMatches(),
    );
  }
}
