import { Injectable, Logger } from '@nestjs/common';
import { createHash } from 'node:crypto';
import { getEnv } from '../config/env';
import { Fernet, InvalidToken } from '../common/crypto/fernet';
import { isoToEpochMs, pyRound } from '../common/py-compat';
import { DataStoreService, Dict } from '../persistence/data-store.service';

export const VOTING_WINDOW_DAYS = 30;

export interface VotePayload {
  fun: number;
  cost: number;
  originality: number;
}

/**
 * Port of `services/vote_service.py`. Individual votes are only ever
 * decrypted to compute aggregates or to show voters their own vote; the
 * voter identity is stored as a one-way hash.
 */
@Injectable()
export class VoteService {
  private readonly logger = new Logger('VoteService');

  constructor(private readonly store: DataStoreService) {}

  isVotingOpen(event: Dict, now: number = Date.now()): boolean {
    return now - isoToEpochMs(event.createdAt) <= VOTING_WINDOW_DAYS * 24 * 60 * 60 * 1000;
  }

  getFernet(): Fernet {
    const key = getEnv('VOTE_ENCRYPTION_KEY');
    if (!key) throw new Error('VOTE_ENCRYPTION_KEY is not configured');
    return new Fernet(key);
  }

  buildVoterHash(voterId: string, eventId: string): string {
    return createHash('sha256').update(`${voterId}:${eventId}`, 'utf-8').digest('hex');
  }

  /** Same plaintext bytes Python's `json.dumps(...)` produced. */
  encryptVote(fernet: Fernet, vote: VotePayload): string {
    const plaintext = `{"fun": ${vote.fun}, "cost": ${vote.cost}, "originality": ${vote.originality}}`;
    return fernet.encrypt(Buffer.from(plaintext, 'utf-8'));
  }

  decryptVotePayload(fernet: Fernet, encryptedPayload: string, eventId?: string | null): VotePayload | null {
    let plaintext: string;
    try {
      plaintext = fernet.decrypt(encryptedPayload).toString('utf-8');
    } catch (error) {
      if (!(error instanceof InvalidToken)) throw error;
      if (eventId) this.logger.warn(`Invalid vote payload for event ${eventId}`);
      else this.logger.warn('Invalid vote payload encountered');
      return null;
    }
    return JSON.parse(plaintext) as VotePayload;
  }

  async hasVoted(eventId: string, voterId: string): Promise<boolean> {
    const voterHash = this.buildVoterHash(voterId, eventId);
    const votes = await this.store.votesRepo.read();
    return votes.some((vote) => vote.voterIdHash === voterHash);
  }

  async getUserVote(eventId: string, voterId: string): Promise<VotePayload | null> {
    const voterHash = this.buildVoterHash(voterId, eventId);
    const votes = await this.store.votesRepo.read();
    const fernet = this.getFernet();
    for (const vote of votes) {
      if (vote.voterIdHash !== voterHash || vote.eventId !== eventId) continue;
      const payload = this.decryptVotePayload(fernet, vote.encryptedPayload, eventId);
      if (payload !== null) return payload;
    }
    return null;
  }

  async countEventVotes(eventId: string): Promise<number> {
    const votes = await this.store.votesRepo.read();
    return votes.filter((vote) => vote.eventId === eventId).length;
  }

  async getEventGeneralAverage(eventId: string): Promise<number | null> {
    const scores = await this.decryptEventScores(eventId);
    if (!scores.length) return null;
    return pyRound(sum(scores) / scores.length);
  }

  async decryptEventScores(eventId: string): Promise<number[]> {
    const votes = await this.store.votesRepo.read();
    const fernet = this.getFernet();
    const scores: number[] = [];
    for (const vote of votes) {
      if (vote.eventId !== eventId) continue;
      const payload = this.decryptVotePayload(fernet, vote.encryptedPayload, eventId);
      if (payload === null) continue;
      scores.push((payload.fun + payload.cost + payload.originality) / 3);
    }
    return scores;
  }

  async getVoteAveragesByEvent(): Promise<Record<string, number>> {
    const votes = await this.store.votesRepo.read();
    const fernet = this.getFernet();
    const grouped: Record<string, number[]> = {};
    for (const vote of votes) {
      const payload = this.decryptVotePayload(fernet, vote.encryptedPayload, vote.eventId);
      if (payload === null) continue;
      (grouped[vote.eventId] ??= []).push((payload.fun + payload.cost + payload.originality) / 3);
    }
    return Object.fromEntries(
      Object.entries(grouped)
        .filter(([, values]) => values.length)
        .map(([eventId, values]) => [eventId, sum(values) / values.length]),
    );
  }
}

/**
 * Python 3.12+ `sum()` over floats, which uses Neumaier compensated summation
 * (the API runs on 3.12, see api/.python-version). Matters for values like
 * `ceil(average * 10)` where one ulp changes the result.
 */
export function sum(values: number[]): number {
  let total = 0;
  let compensation = 0;
  for (const value of values) {
    const t = total + value;
    if (Math.abs(total) >= Math.abs(value)) compensation += total - t + value;
    else compensation += value - t + total;
    total = t;
  }
  if (compensation && Number.isFinite(compensation)) total += compensation;
  return total;
}
