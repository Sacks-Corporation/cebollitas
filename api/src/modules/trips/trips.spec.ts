import { HttpException } from '@nestjs/common';
import { todayInArgentina } from '../../common/py-compat';
import { assertAttendees, tripCoversMonth } from './trips.rules';
import { serializeTrip, TripCreate } from './trips.schemas';

const shift = (isoDay: string, days: number) => {
  const date = new Date(`${isoDay}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
};

function makePayload(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  const today = todayInArgentina();
  return {
    title: 'Crucero',
    description: 'Pasó de todo',
    destinations: ['Caribe'],
    startDate: shift(today, -5),
    endDate: shift(today, -1),
    photos: [],
    attendeeIds: ['u1', 'u2', 'u3', 'u4'],
    ...overrides,
  };
}

/** Parses like `TripCreate.model_validate`, returning the data or the joined error messages. */
function validate(payload: Record<string, unknown>) {
  const result = TripCreate.safeParse(payload);
  return result.success
    ? { ok: true as const, data: result.data }
    : { ok: false as const, message: result.error.issues.map((issue) => issue.message).join(' | ') };
}

describe('TripCreate dates', () => {
  it('accepts an end date of today', () => {
    const today = todayInArgentina();
    const result = validate(makePayload({ startDate: today, endDate: today }));
    expect(result.ok && result.data.endDate).toBe(today);
  });

  it('rejects an end date in the future', () => {
    const result = validate(makePayload({ endDate: shift(todayInArgentina(), 1) }));
    expect(!result.ok && result.message).toMatch(/no puede ser posterior a hoy/);
  });

  it('rejects an end date before the start date', () => {
    const today = todayInArgentina();
    const result = validate(makePayload({ startDate: shift(today, -1), endDate: shift(today, -10) }));
    expect(!result.ok && result.message).toMatch(/no puede ser anterior a la fecha desde/);
  });
});

describe('TripCreate photos', () => {
  it('accepts up to three photos', () => {
    const result = validate(makePayload({ photos: ['a', 'b', 'c'] }));
    expect(result.ok && result.data.photos).toHaveLength(3);
  });

  it('rejects more than three photos', () => {
    expect(validate(makePayload({ photos: ['a', 'b', 'c', 'd'] })).ok).toBe(false);
  });
});

describe('TripCreate text fields', () => {
  it('strips surrounding whitespace', () => {
    const result = validate(makePayload({ title: '  Crucero  ', destinations: [' Caribe '] }));
    expect(result.ok && result.data.title).toBe('Crucero');
    expect(result.ok && result.data.destinations).toEqual(['Caribe']);
  });

  it('rejects whitespace-only text', () => {
    const result = validate(makePayload({ title: '   ' }));
    expect(!result.ok && result.message).toMatch(/no puede quedar vacío/);
  });
});

describe('TripCreate destinations', () => {
  it('accepts several destinations', () => {
    const result = validate(makePayload({ destinations: ['Caribe', 'Bahamas', 'Miami'] }));
    expect(result.ok && result.data.destinations).toEqual(['Caribe', 'Bahamas', 'Miami']);
  });

  it('requires at least one destination', () => {
    expect(validate(makePayload({ destinations: [] })).ok).toBe(false);
  });

  it('rejects whitespace-only destinations', () => {
    const result = validate(makePayload({ destinations: ['Caribe', '   '] }));
    expect(!result.ok && result.message).toMatch(/no pueden quedar vacíos/);
  });

  it('rejects duplicate destinations', () => {
    const result = validate(makePayload({ destinations: ['Caribe', 'Caribe'] }));
    expect(!result.ok && result.message).toMatch(/destinos tiene repetidos/);
  });

  it('reads a legacy single destination', () => {
    const payload = makePayload();
    delete payload.destinations;
    payload.destination = 'Crucero';
    const result = validate(payload);
    expect(result.ok && result.data.destinations).toEqual(['Crucero']);
  });
});

describe('Trip response model', () => {
  it('reads a legacy record without creator or photos', () => {
    const trip = serializeTrip({
      id: 't1',
      title: 'Vacaciones CRUCERO',
      description: 'Indescriptible',
      destination: 'Crucero', // legacy single-destination record
      startDate: '2026-02-12',
      endDate: '2026-02-12',
      attendeeIds: ['u1', 'u2', 'u3', 'u4'],
      createdAt: '2026-05-19T12:00:00+00:00',
      updatedAt: '2026-05-19T12:00:00+00:00',
    });
    expect(trip.creatorId).toBeNull();
    expect(trip.photos).toEqual([]);
    expect(trip.destinations).toEqual(['Crucero']);
    expect(trip.createdAt).toBe('2026-05-19T12:00:00Z');
  });
});

describe('tripCoversMonth', () => {
  it.each([12, 1])('covers month %i across a year boundary', (month) => {
    expect(tripCoversMonth({ startDate: '2025-12-28', endDate: '2026-01-04' }, month)).toBe(true);
  });

  it('does not cover an unrelated month', () => {
    expect(tripCoversMonth({ startDate: '2025-12-28', endDate: '2026-01-04' }, 6)).toBe(false);
  });

  it('covers only its own month when short', () => {
    const trip = { startDate: '2026-03-02', endDate: '2026-03-09' };
    expect(tripCoversMonth(trip, 3)).toBe(true);
    expect(tripCoversMonth(trip, 4)).toBe(false);
  });
});

describe('assertAttendees', () => {
  const knownUsers = Array.from({ length: 5 }, (_, i) => ({ id: `u${i + 1}`, name: `User ${i + 1}` }));
  const detailOf = (fn: () => void) => {
    try {
      fn();
    } catch (error) {
      const exception = error as HttpException;
      return { status: exception.getStatus(), detail: (exception.getResponse() as { detail: string }).detail };
    }
    throw new Error('expected an HttpException');
  };

  it('accepts four distinct known users', () => {
    expect(() => assertAttendees(['u1', 'u2', 'u3', 'u4'], knownUsers)).not.toThrow();
  });

  it('rejects duplicates', () => {
    const { status, detail } = detailOf(() => assertAttendees(['u1', 'u1', 'u2', 'u3'], knownUsers));
    expect(status).toBe(400);
    expect(detail).toContain('repetidos');
  });

  it('rejects fewer than four', () => {
    const { status, detail } = detailOf(() => assertAttendees(['u1', 'u2', 'u3'], knownUsers));
    expect(status).toBe(400);
    expect(detail).toContain('al menos 4');
  });

  it('rejects unknown users', () => {
    const { status, detail } = detailOf(() => assertAttendees(['u1', 'u2', 'u3', 'ghost'], knownUsers));
    expect(status).toBe(400);
    expect(detail).toContain('usuarios habilitados');
  });
});
