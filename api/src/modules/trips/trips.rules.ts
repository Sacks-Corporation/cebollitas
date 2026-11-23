import { httpError } from '../../common/http-errors';
import { Dict } from '../../persistence/data-store.service';

export const MIN_TRIP_ATTENDEES = 4;

/**
 * Attendees drive the ranking (one trip = 70 points each), so the list has to
 * be distinct and made of real users before it is stored.
 */
export function assertAttendees(attendeeIds: string[], allowedUsers: Dict[]): void {
  const unique = new Set(attendeeIds);
  if (unique.size !== attendeeIds.length) throw httpError(400, 'La lista de asistentes tiene repetidos.');
  if (unique.size < MIN_TRIP_ATTENDEES) {
    throw httpError(400, `Se requieren al menos ${MIN_TRIP_ATTENDEES} asistentes para registrar el viaje.`);
  }
  const knownIds = new Set(allowedUsers.map((user) => user.id));
  if ([...unique].some((id) => !knownIds.has(id))) {
    throw httpError(400, 'Hay asistentes que no están en la lista de usuarios habilitados.');
  }
}

/**
 * Whether the trip spans the given calendar month. Walks the months it covers
 * so trips crossing a year boundary are matched correctly.
 */
export function tripCoversMonth(trip: Dict, month: number): boolean {
  const [startYear, startMonth] = String(trip.startDate).split('-').map(Number);
  const [endYear, endMonth] = String(trip.endDate).split('-').map(Number);
  let year = startYear;
  let current = startMonth;
  while (year < endYear || (year === endYear && current <= endMonth)) {
    if (current === month) return true;
    if (current === 12) {
      year += 1;
      current = 1;
    } else current += 1;
  }
  return false;
}
