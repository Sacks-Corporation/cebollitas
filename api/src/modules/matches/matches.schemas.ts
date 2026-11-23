import { todayUtc } from '../../common/py-compat';
import { opt, serializeDate } from '../../common/serialize';
import { FieldError, pyDate, pyInt, pyLiteral, pyModel, pyStr } from '../../common/validation/py-schema';
import { Dict } from '../../persistence/data-store.service';

export const MATCH_RESULTS = ['win', 'loss', 'draw'] as const;

/** Match date must belong to the current (UTC) year and not be in the future. */
export function validateMatchDate(value: string): string {
  const today = todayUtc();
  if (value.slice(0, 4) !== today.slice(0, 4)) throw new FieldError('La fecha debe pertenecer al año en curso.');
  if (value > today) throw new FieldError('La fecha no puede ser posterior a hoy.');
  return value;
}

export const MatchCreate = pyModel(
  {
    result: pyLiteral(MATCH_RESULTS),
    goals: pyInt({ ge: 0 }),
    stadium: pyStr({ minLength: 1, maxLength: 200 }),
    date: pyDate(),
    // Admin-only target player; ignored for non-admins (they create for
    // themselves, derived from the JWT). null means "for myself".
    userId: pyStr({ nullable: true, default: null }),
  },
  { name: 'MatchCreate', fieldValidators: { date: validateMatchDate } },
);
export type MatchCreateInput = typeof MatchCreate._output;

export const MatchUpdate = pyModel(
  {
    // `result` is intentionally absent — it cannot be edited.
    goals: pyInt({ ge: 0 }),
    stadium: pyStr({ minLength: 1, maxLength: 200 }),
    date: pyDate(),
  },
  { name: 'MatchUpdate', fieldValidators: { date: validateMatchDate } },
);
export type MatchUpdateInput = typeof MatchUpdate._output;

/** `Match` response model. */
export function serializeMatch(match: Dict) {
  return {
    id: match.id,
    userId: match.userId,
    playerName: match.playerName,
    date: serializeDate(match.date),
    result: match.result,
    goals: opt(match.goals),
    stadium: opt(match.stadium),
  };
}

/** `PlayerStats` response model. */
export function serializePlayerStats(stats: Dict) {
  const { userId, playerName, played, won, drawn, lost, goals, winRate } = stats;
  return { userId, playerName, played, won, drawn, lost, goals, winRate };
}

/** `PlayerWorldCups` response model. */
export function serializeWorldCups(item: Dict) {
  return { userId: item.userId, playerName: item.playerName, worldCups: item.worldCups };
}
