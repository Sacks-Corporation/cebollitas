import { z } from 'zod';
import { todayInArgentina } from '../../common/py-compat';
import { serializeDatetime } from '../../common/serialize';
import { FieldError, pyDate, pyList, pyModel, pyStr } from '../../common/validation/py-schema';
import { Dict } from '../../persistence/data-store.service';

export const MAX_TRIP_PHOTOS = 3;
export const MAX_TRIP_DESTINATIONS = 10;

const tripBaseShape = {
  title: pyStr({ minLength: 1, maxLength: 100 }),
  description: pyStr({ minLength: 1, maxLength: 1000 }),
  startDate: pyDate(),
  endDate: pyDate(),
  destinations: pyList(pyStr(), { minLength: 1, maxLength: MAX_TRIP_DESTINATIONS }),
  photos: pyList(pyStr(), { default: () => [], maxLength: MAX_TRIP_PHOTOS }),
  attendeeIds: pyList(pyStr(), { default: () => [] }),
};

export type TripInput = { [K in keyof typeof tripBaseShape]: z.output<(typeof tripBaseShape)[K]> };

/**
 * Trips stored before multi-destination support carry a single `destination`
 * string. Read them as a one-item list.
 */
function acceptLegacyDestination(data: Record<string, unknown>): Record<string, unknown> {
  if (!('destinations' in data) && 'destination' in data) {
    const { destination, ...rest } = data;
    return { ...rest, destinations: [destination] };
  }
  return data;
}

/** Mirror the client-side trim so direct API callers can't store whitespace-only text. */
function stripText(value: string): string {
  const stripped = value.trim();
  if (!stripped) throw new FieldError('El campo no puede quedar vacío.');
  return stripped;
}

function stripDestinations(values: string[]): string[] {
  const stripped = values.map((value) => value.trim());
  if (stripped.some((value) => !value)) throw new FieldError('Los destinos no pueden quedar vacíos.');
  if (stripped.some((value) => [...value].length > 200)) {
    throw new FieldError('Cada destino puede tener hasta 200 caracteres.');
  }
  if (new Set(stripped).size !== stripped.length) throw new FieldError('La lista de destinos tiene repetidos.');
  return stripped;
}

/**
 * A trip can only be recorded once it is over: the end date must not be in
 * the future, and it can never precede the start date. "Today" is the
 * Argentine calendar day, matching what the client validates against.
 */
function validateTripDates(model: TripInput): TripInput {
  if (model.endDate < model.startDate) throw new FieldError('La fecha hasta no puede ser anterior a la fecha desde.');
  if (model.endDate > todayInArgentina()) throw new FieldError('La fecha hasta no puede ser posterior a hoy.');
  return model;
}

const tripModelOptions = {
  before: acceptLegacyDestination,
  fieldValidators: { title: stripText, description: stripText, destinations: stripDestinations },
};

export const TripCreate = pyModel(tripBaseShape, {
  ...tripModelOptions,
  name: 'TripCreate',
  after: [validateTripDates],
});
export const TripUpdate = pyModel(tripBaseShape, {
  ...tripModelOptions,
  name: 'TripUpdate',
  after: [validateTripDates],
});

/** `Trip` response model (its base validators also run on read, like Pydantic). */
const TripRead = pyModel(
  {
    ...tripBaseShape,
    id: pyStr(),
    // Trips loaded before the ABM existed carry no creator, so only admins can edit those.
    creatorId: pyStr({ nullable: true, default: null }),
    createdAt: pyStr(),
    updatedAt: pyStr(),
  },
  { ...tripModelOptions, name: 'Trip' },
);

export function serializeTrip(trip: Dict) {
  const result = TripRead.safeParse(trip);
  if (!result.success) throw new Error(`Response validation failed for trip ${String(trip.id)}`);
  const data = result.data;
  return { ...data, createdAt: serializeDatetime(data.createdAt), updatedAt: serializeDatetime(data.updatedAt) };
}
