import { z } from 'zod';
import { list, opt, serializeDate, serializeDatetime } from '../../common/serialize';
import { pyDate, pyFloat, pyInt, pyList, pyLiteral, pyModel, pyStr } from '../../common/validation/py-schema';
import { Dict } from '../../persistence/data-store.service';

export const EVENT_TYPES = ['regular', 'extended', 'monthly_event', 'trip', 'sports_bonus'] as const;

/** Minimum attendees to record an event (business rule). */
export const MIN_EVENT_ATTENDEES = 4;
export const MIN_ATTENDEES_MSG = 'Se requieren al menos 4 asistentes para registrar el evento.';

const eventBaseShape = {
  title: pyStr({ minLength: 1, maxLength: 100 }),
  description: pyStr({ minLength: 1, maxLength: 1000 }),
  date: pyDate(),
  eventType: pyLiteral(EVENT_TYPES),
  location: pyStr({ maxLength: 200, nullable: true, default: null }),
  amount: pyFloat({ ge: 0, nullable: true, default: null }),
  imageUrl: pyStr({ maxLength: 500, nullable: true, default: null }),
  imagePosition: pyStr({ maxLength: 20, nullable: true, default: null }),
  attendeeIds: pyList(pyStr(), { default: () => [] }),
  organizerId: pyStr({ nullable: true, default: null }),
};

export type EventInput = { [K in keyof typeof eventBaseShape]: z.output<(typeof eventBaseShape)[K]> };

export const EventCreate = pyModel(eventBaseShape, { name: 'EventCreate' });
export const EventUpdate = pyModel(eventBaseShape, { name: 'EventUpdate' });

/** Query params of `GET /api/events`. */
export const EventListQuery = {
  month: pyInt({ ge: 1, le: 12, nullable: true, default: null }),
  type: pyStr({ nullable: true, default: null }),
  attendeeId: pyStr({ nullable: true, default: null }),
};

/** `Event` response model. */
export function serializeEvent(event: Dict) {
  return {
    title: event.title,
    description: event.description,
    date: serializeDate(event.date),
    eventType: event.eventType,
    location: opt(event.location),
    amount: opt(event.amount),
    imageUrl: opt(event.imageUrl),
    imagePosition: opt(event.imagePosition),
    attendeeIds: list(event.attendeeIds),
    organizerId: opt(event.organizerId),
    id: event.id,
    creatorId: event.creatorId,
    createdAt: serializeDatetime(event.createdAt),
    updatedAt: serializeDatetime(event.updatedAt),
    voteAverage: opt(event.voteAverage),
  };
}
