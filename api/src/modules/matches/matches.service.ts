/**
 * Port of `services/matches_service.py` (football matches).
 *
 * Matches are loaded from the source Excel into the `matches` collection by
 * `scripts/load_matches_excel.py`. Each match stores a `userId` linking to
 * allowed_users; this service resolves the current display name and owns the
 * ordering so the controller stays thin.
 */
import { Injectable } from '@nestjs/common';
import { pyRound, pySorted } from '../../common/py-compat';
import { ROLE_FUTBOL } from '../../core/roles.service';
import { DataStoreService, Dict } from '../../persistence/data-store.service';

const AXEL_ID = '13e75b34-e46a-57c2-aaad-0ccd39b8e488';

// Manual world cup adjustments by calendar year -> {userId: bonus}. Applied only
// for the current year, so they don't carry over to future seasons.
export const WORLD_CUP_BONUSES: Record<number, Record<string, number>> = {
  2026: { [AXEL_ID]: 1 },
};

// Players who always rank below others when tied on world cups.
export const WORLD_CUP_TIE_LOSERS = new Set([AXEL_ID]);

const count = <T>(items: T[], value: T): number => items.filter((item) => item === value).length;

/**
 * Count completed "world cups" over a chronological list of results.
 *
 * A world cup is a run of 7 matches: a 3-match group stage that totals >= 4
 * points (win=3, draw=1, loss=0) followed by 4 straight wins. The run resets —
 * and the next one starts at the following match — when the cup is won, a 2nd
 * loss occurs within the group stage, the group stage ends under 4 points, or
 * any non-win occurs in the knockout phase (matches 4-7).
 */
export function countWorldCups(results: Array<string | undefined>): number {
  let won = 0;
  let attempt: Array<string | undefined> = [];
  for (const result of results) {
    attempt.push(result);
    const position = attempt.length;
    if (position <= 3) {
      if (count(attempt, 'loss') >= 2) attempt = [];
      else if (position === 3) {
        const points = 3 * count(attempt, 'win') + count(attempt, 'draw');
        if (points < 4) attempt = [];
      }
    } else if (result !== 'win') {
      attempt = [];
    } else if (position === 7) {
      won += 1;
      attempt = [];
    }
  }
  return won;
}

@Injectable()
export class MatchesService {
  constructor(private readonly store: DataStoreService) {}

  private async nameById(): Promise<Map<string, string>> {
    return new Map((await this.store.getAllowedUsers()).map((user) => [user.id, user.name]));
  }

  private async futbolPlayers(): Promise<Dict[]> {
    return (await this.store.getAllowedUsers()).filter((user) => (user.roles ?? []).includes(ROLE_FUTBOL));
  }

  private groupByUser(matches: Dict[]): Map<string, Dict[]> {
    const grouped = new Map<string, Dict[]>();
    for (const match of matches) {
      const list = grouped.get(match.userId) ?? [];
      list.push(match);
      grouped.set(match.userId, list);
    }
    return grouped;
  }

  /** Attach the player's current display name (resolved from allowed_users). */
  async withPlayerName(match: Dict): Promise<Dict> {
    const names = await this.nameById();
    return { ...match, playerName: names.get(match.userId) ?? '' };
  }

  /** All matches, most recent first, with the player's resolved name. */
  async listMatches(): Promise<Dict[]> {
    const names = await this.nameById();
    const matches = pySorted(await this.store.getMatches(), (match) => [match.date ?? ''], true);
    return matches.map((match) => ({ ...match, playerName: names.get(match.userId) ?? '' }));
  }

  /** Per-player stats for every FUTBOL user (players without matches included), sorted by name. */
  async listPlayerStats(): Promise<Dict[]> {
    const players = await this.futbolPlayers();
    const matchesByUser = this.groupByUser(await this.store.getMatches());

    const stats = players.map((player) => {
      const playerMatches = matchesByUser.get(player.id) ?? [];
      const played = playerMatches.length;
      const won = playerMatches.filter((match) => match.result === 'win').length;
      const drawn = playerMatches.filter((match) => match.result === 'draw').length;
      const lost = playerMatches.filter((match) => match.result === 'loss').length;
      const goals = playerMatches.reduce((total, match) => total + (match.goals || 0), 0);
      const winRate = played ? pyRound(((won * 3 + drawn) / (played * 3)) * 100, 2) : 0;
      return { userId: player.id, playerName: player.name, played, won, drawn, lost, goals, winRate };
    });

    return pySorted(stats, (item) => [item.playerName.toLowerCase()]);
  }

  /** Per-FUTBOL-user world cup count, sorted by count desc then name. */
  async listWorldCups(): Promise<Dict[]> {
    const players = await this.futbolPlayers();
    const matchesByUser = this.groupByUser(await this.store.getMatches());
    const bonuses = WORLD_CUP_BONUSES[new Date().getUTCFullYear()] ?? {};

    const result = players.map((player) => {
      const ordered = pySorted(matchesByUser.get(player.id) ?? [], (match) => [match.date ?? '']);
      const total = countWorldCups(ordered.map((match) => match.result)) + (bonuses[player.id] ?? 0);
      return { userId: player.id, playerName: player.name, worldCups: total };
    });

    // Tie-loser players sort after everyone else at the same count.
    return pySorted(result, (item) => [
      -item.worldCups,
      WORLD_CUP_TIE_LOSERS.has(item.userId) ? 1 : 0,
      item.playerName.toLowerCase(),
    ]);
  }
}
