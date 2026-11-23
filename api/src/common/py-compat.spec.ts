import { sum } from '../core/vote.service';
import { normalizeDateInput, pyRound, pySorted, pyUtcNowIso, serializeDatetime, todayInArgentina } from './py-compat';

describe('pyRound (Python round())', () => {
  it('rounds half to even with no digits', () => {
    // Python: round(0.5), round(1.5), round(2.5), round(-2.5), round(12.5)
    expect([0.5, 1.5, 2.5, -2.5, 12.5].map((v) => pyRound(v))).toEqual([0, 2, 2, -2, 12]);
    expect(pyRound((100 * 2) / 3)).toBe(67);
  });

  it('rounds on the exact binary value with digits', () => {
    // Python: round(66.665, 2)=66.67, round(1.005, 2)=1.0, round(2.675, 2)=2.67, round(83.33333333, 2)=83.33
    expect(pyRound(66.665, 2)).toBe(66.67);
    expect(pyRound(1.005, 2)).toBe(1);
    expect(pyRound(2.675, 2)).toBe(2.67);
    expect(pyRound(83.33333333, 2)).toBe(83.33);
  });
});

describe('sum (Python 3.12 compensated float sum)', () => {
  it('matches Python 3.12 where naive summation drifts', () => {
    expect(sum(Array(10).fill(0.1))).toBe(1);
    expect(sum([])).toBe(0);
  });
});

describe('datetime helpers', () => {
  it('writes timestamps like datetime.isoformat()', () => {
    expect(pyUtcNowIso(new Date('2026-11-23T16:40:05.062Z'))).toBe('2026-11-23T16:40:05.062000+00:00');
    expect(pyUtcNowIso(new Date('2026-11-23T16:40:05.000Z'))).toBe('2026-11-23T16:40:05+00:00');
  });

  it('serializes datetimes like Pydantic', () => {
    expect(serializeDatetime('2026-03-01T10:00:00.123456+00:00')).toBe('2026-03-01T10:00:00.123456Z');
    expect(serializeDatetime('2026-03-01T10:00:00.123+00:00')).toBe('2026-03-01T10:00:00.123000Z');
    expect(serializeDatetime('2026-03-01T10:00:00+00:00')).toBe('2026-03-01T10:00:00Z');
    expect(serializeDatetime('2026-03-01T10:00:00')).toBe('2026-03-01T10:00:00');
    expect(serializeDatetime('2026-03-01T10:00:00-03:00')).toBe('2026-03-01T10:00:00-03:00');
  });

  it('accepts dates like Pydantic', () => {
    expect(normalizeDateInput('2026-03-01')).toBe('2026-03-01');
    expect(normalizeDateInput('2026-03-01T00:00:00')).toBe('2026-03-01');
    expect(normalizeDateInput('2026-03-01T10:00:00')).toBeNull();
    expect(normalizeDateInput('2026-02-30')).toBeNull();
    expect(normalizeDateInput(20260301)).toBeNull();
  });

  it('computes the Argentine calendar day (UTC-3)', () => {
    expect(todayInArgentina(new Date('2026-11-24T02:59:00Z'))).toBe('2026-11-23');
    expect(todayInArgentina(new Date('2026-11-24T03:00:00Z'))).toBe('2026-11-24');
  });
});

describe('pySorted', () => {
  it('is stable in reverse and compares strings by code point', () => {
    const items = [
      { k: 'b', n: 1 },
      { k: 'a', n: 2 },
      { k: 'b', n: 3 },
      { k: 'B', n: 4 },
    ];
    expect(pySorted(items, (i) => [i.k], true).map((i) => i.n)).toEqual([1, 3, 2, 4]);
  });
});
