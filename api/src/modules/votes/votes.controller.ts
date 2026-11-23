import { Controller, Get, HttpCode, Post, Res } from '@nestjs/common';
import type { Response } from 'express';
import { randomUUID } from 'node:crypto';
import { CurrentUser, CurrentUserData } from '../../common/auth/current-user';
import { Authenticated } from '../../common/auth/guards';
import { httpError } from '../../common/http-errors';
import { pyRound } from '../../common/py-compat';
import { pyInt, pyModel, pyStr } from '../../common/validation/py-schema';
import { ValidateRequest, VBody, VParams, VQuery } from '../../common/validation/request-validation';
import { sum, VoteService } from '../../core/vote.service';
import { DataStoreService } from '../../persistence/data-store.service';

const VoteCreate = pyModel(
  {
    eventId: pyStr(),
    fun: pyInt({ ge: 1, le: 10 }),
    cost: pyInt({ ge: 1, le: 10 }),
    originality: pyInt({ ge: 1, le: 10 }),
  },
  { name: 'VoteCreate' },
);

interface VoteCreateInput {
  eventId: string;
  fun: number;
  cost: number;
  originality: number;
}

const EventIdQuery = { eventId: pyStr() };

@Controller('api/votes')
@Authenticated()
export class VotesController {
  constructor(
    private readonly store: DataStoreService,
    private readonly votes: VoteService,
  ) {}

  @Post()
  @HttpCode(201)
  @ValidateRequest({ body: VoteCreate })
  async castVote(@VBody() payload: VoteCreateInput, @CurrentUser() currentUser: CurrentUserData) {
    const event = (await this.store.eventsRepo.read()).find((item) => item.id === payload.eventId);
    if (!event) throw httpError(404, 'Evento no encontrado.');

    if (event.eventType !== 'monthly_event') throw httpError(400, 'Solo se pueden votar eventos del mes.');

    if (!(event.attendeeIds ?? []).includes(currentUser.id)) {
      throw httpError(403, 'Solo podés votar eventos en los que participaste.');
    }

    if (currentUser.id === event.organizerId) throw httpError(403, 'El organizador no puede votar su propio evento.');

    if (await this.votes.hasVoted(payload.eventId, currentUser.id)) throw httpError(400, 'Ya votaste este evento.');

    if (!this.votes.isVotingOpen(event)) {
      throw httpError(400, 'El período de votación cerró (30 días desde la creación).');
    }

    const fernet = this.votes.getFernet();
    const encryptedPayload = this.votes.encryptVote(fernet, payload);

    const votes = await this.store.votesRepo.read();
    votes.push({
      id: randomUUID(),
      eventId: payload.eventId,
      voterIdHash: this.votes.buildVoterHash(currentUser.id, payload.eventId),
      encryptedPayload,
    });
    await this.store.votesRepo.write(votes);

    return { ok: true };
  }

  @Get('has-voted')
  @ValidateRequest({ query: EventIdQuery })
  async checkHasVoted(@VQuery() query: { eventId: string }, @CurrentUser() currentUser: CurrentUserData) {
    return { hasVoted: await this.votes.hasVoted(query.eventId, currentUser.id) };
  }

  @Get('my-vote')
  @ValidateRequest({ query: EventIdQuery })
  async getMyVote(
    @VQuery() query: { eventId: string },
    @CurrentUser() currentUser: CurrentUserData,
    @Res() res: Response,
  ): Promise<void> {
    const vote = await this.votes.getUserVote(query.eventId, currentUser.id);
    // FastAPI serialized `None` as a literal `null` body (Nest would send an empty one).
    res
      .status(200)
      .json(vote ? { fun: vote.fun, cost: vote.cost, originality: vote.originality } : null);
  }

  @Get(':event_id/average')
  @ValidateRequest({ params: { event_id: pyStr() } })
  async getAverage(@VParams() params: { event_id: string }) {
    const scores = await this.votes.decryptEventScores(params.event_id);
    if (!scores.length) return { averageScore: 0 };
    return { averageScore: pyRound(sum(scores) / scores.length, 2) };
  }
}
