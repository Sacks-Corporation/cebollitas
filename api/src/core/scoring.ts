/** Port of `services/scoring_service.py`. Scoring is automatic by `eventType`. */
import { pyRound } from '../common/py-compat';
import { Dict } from '../persistence/data-store.service';

export const ATTENDEE_POINTS = 30;
export const ORGANIZER_POINTS = 40;
export const EXTENDED_POINTS = 15;
export const MONTHLY_ATTENDEE_POINTS = 40;
export const TRIP_POINTS = 70;

// Contract bonus: organizing sporting events (Cebollitas football matches) earns
// SPORTS_EVENT_BONUS points every SPORTS_EVENTS_PER_BONUS matches organized, up
// to SPORTS_BONUS_MAX_TIMES occasions (so at most 3 * 40 = 120 points).
export const SPORTS_EVENT_BONUS = 40;
export const SPORTS_EVENTS_PER_BONUS = 10;
export const SPORTS_BONUS_MAX_TIMES = 3;

export interface RankingRow {
  userId: string;
  name: string;
  totalPoints: number;
  attendancePercentage: number;
  absences: number;
}

/** Points earned for organizing `organizedCount` sporting events. */
export function sportsOrganizerBonus(organizedCount: number): number {
  return Math.min(Math.floor(organizedCount / SPORTS_EVENTS_PER_BONUS), SPORTS_BONUS_MAX_TIMES) * SPORTS_EVENT_BONUS;
}

/** Python's `x or default` for the values found in stored documents. */
function orDefault<T>(value: T | null | undefined, fallback: T): T {
  return value === null || value === undefined || (value as unknown) === 0 || (value as unknown) === '' ? fallback : value;
}

export function computeRankings(
  users: Dict[],
  events: Dict[],
  trips: Dict[] | null = null,
  voteAverages: Record<string, number> | null = null,
  cebollitasMatches: Dict[] | null = null,
): RankingRow[] {
  const tripList = trips ?? [];
  const averages = voteAverages ?? {};
  const matchList = cebollitasMatches ?? [];
  const totals = new Map<string, number>();
  const attendance = new Map<string, number>();
  const add = (map: Map<string, number>, key: string, amount: number) => map.set(key, (map.get(key) ?? 0) + amount);

  for (const event of events) {
    const eventType = event.eventType;
    const organizerId = event.organizerId;
    for (const attendeeId of event.attendeeIds ?? []) {
      add(attendance, attendeeId, 1);

      if (eventType === 'extended') {
        add(totals, attendeeId, EXTENDED_POINTS);
      } else if (eventType === 'monthly_event') {
        if (attendeeId === organizerId) {
          // Prefer the live average computed from actual votes; fall back to a
          // stored voteAverage when no votes are provided.
          let average: number | undefined = Object.prototype.hasOwnProperty.call(averages, event.id)
            ? averages[event.id]
            : undefined;
          if (average === undefined || average === null) average = orDefault(event.voteAverage, 0);
          add(totals, attendeeId, Math.ceil((average as number) * 10));
        } else {
          add(totals, attendeeId, MONTHLY_ATTENDEE_POINTS);
        }
      } else if (attendeeId === organizerId) {
        add(totals, attendeeId, ORGANIZER_POINTS);
      } else {
        add(totals, attendeeId, ATTENDEE_POINTS);
      }
    }
  }

  for (const trip of tripList) {
    for (const attendeeId of trip.attendeeIds ?? []) add(totals, attendeeId, TRIP_POINTS);
  }

  const organizedCounts = new Map<string, number>();
  for (const match of matchList) {
    if (match.organizerId) add(organizedCounts, match.organizerId, 1);
  }
  for (const [organizerId, count] of organizedCounts) add(totals, organizerId, sportsOrganizerBonus(count));

  const totalEvents = events.length;
  const ranking: RankingRow[] = users.map((user) => {
    const attended = attendance.get(user.id) ?? 0;
    return {
      userId: user.id,
      name: user.name,
      totalPoints: totals.get(user.id) ?? 0,
      attendancePercentage: totalEvents > 0 ? pyRound((attended / totalEvents) * 100) : 0,
      absences: totalEvents - attended,
    };
  });

  // Stable descending sort, like `list.sort(key=..., reverse=True)`.
  return ranking.sort((a, b) => b.totalPoints - a.totalPoints);
}
