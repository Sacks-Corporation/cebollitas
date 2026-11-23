/**
 * Helpers that reproduce the Python / Pydantic semantics the API relies on, so
 * the NestJS port answers exactly like the FastAPI version did.
 */

const pad = (value: number, size = 2): string => String(value).padStart(size, '0');

/**
 * Python's built-in `round()`: round-half-to-even on the exact binary value of
 * the float (so `round(2.5) == 2` and `round(2.675, 2) == 2.67`).
 */
export function pyRound(value: number, ndigits = 0): number {
  if (!Number.isFinite(value)) return value;
  if (ndigits === 0) {
    const floor = Math.floor(value);
    const diff = value - floor;
    if (diff > 0.5) return floor + 1;
    if (diff < 0.5) return floor;
    return floor % 2 === 0 ? floor : floor + 1;
  }
  const negative = value < 0;
  // toFixed(100) yields the exact decimal expansion for the magnitudes we use.
  const [intPart, frac = ''] = Math.abs(value).toFixed(100).split('.');
  const kept = BigInt(intPart + frac.slice(0, ndigits));
  const rest = frac.slice(ndigits);
  const first = rest[0] ?? '0';
  const tailNonZero = /[1-9]/.test(rest.slice(1));
  let rounded = kept;
  if (first > '5' || (first === '5' && (tailNonZero || kept % 2n === 1n))) rounded += 1n;
  const result = Number(rounded) / 10 ** ndigits;
  return negative ? -result : result;
}

/** Python's `datetime.now(timezone.utc).isoformat()`. */
export function pyUtcNowIso(now: Date = new Date()): string {
  const base =
    `${now.getUTCFullYear()}-${pad(now.getUTCMonth() + 1)}-${pad(now.getUTCDate())}` +
    `T${pad(now.getUTCHours())}:${pad(now.getUTCMinutes())}:${pad(now.getUTCSeconds())}`;
  const ms = now.getUTCMilliseconds();
  return `${base}${ms ? `.${pad(ms, 3)}000` : ''}+00:00`;
}

const DATETIME_RE =
  /^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{2}):(\d{2})(?::(\d{2})(?:[.,](\d{1,6})\d*)?)?)?(Z|z|[+-]\d{2}:?\d{2})?$/;

export interface ParsedDatetime {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
  micro: number;
  /** Offset in minutes; null for naive datetimes. */
  offset: number | null;
}

export function isValidCalendarDate(year: number, month: number, day: number): boolean {
  if (month < 1 || month > 12 || day < 1) return false;
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
}

/** Parses an ISO 8601 date/datetime string the way Python/Pydantic accept it. */
export function parseIsoDatetime(value: string): ParsedDatetime | null {
  const match = DATETIME_RE.exec(value);
  if (!match) return null;
  const [, y, mo, d, h, mi, s, frac, tz] = match;
  let offset: number | null = null;
  if (tz) {
    if (tz === 'Z' || tz === 'z') offset = 0;
    else {
      const sign = tz[0] === '-' ? -1 : 1;
      const digits = tz.slice(1).replace(':', '');
      offset = sign * (Number(digits.slice(0, 2)) * 60 + Number(digits.slice(2, 4)));
    }
  }
  const parsed: ParsedDatetime = {
    year: Number(y),
    month: Number(mo),
    day: Number(d),
    hour: Number(h ?? 0),
    minute: Number(mi ?? 0),
    second: Number(s ?? 0),
    micro: frac ? Number(frac.padEnd(6, '0')) : 0,
    offset,
  };
  if (!isValidCalendarDate(parsed.year, parsed.month, parsed.day)) return null;
  if (parsed.hour > 23 || parsed.minute > 59 || parsed.second > 59) return null;
  return parsed;
}

/** `datetime.fromisoformat(value).month` for stored date strings. */
export function isoMonth(value: string): number {
  const parsed = parseIsoDatetime(value);
  if (!parsed) throw new Error(`Invalid isoformat string: '${value}'`);
  return parsed.month;
}

/**
 * Epoch milliseconds of an aware ISO datetime. Naive values throw, like
 * Python does when comparing naive and aware datetimes.
 */
export function isoToEpochMs(value: string): number {
  const p = parseIsoDatetime(value);
  if (!p) throw new Error(`Invalid isoformat string: '${value}'`);
  if (p.offset === null) throw new TypeError("can't compare offset-naive and offset-aware datetimes");
  const utc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second);
  return utc - p.offset * 60_000 + p.micro / 1000;
}

/** Pydantic v2 JSON serialization of a `datetime` field. */
export function serializeDatetime(value: unknown): string {
  if (typeof value !== 'string') throw new Error('datetime value must be a string');
  const p = parseIsoDatetime(value);
  if (!p) throw new Error(`Invalid datetime: '${value}'`);
  let out =
    `${pad(p.year, 4)}-${pad(p.month)}-${pad(p.day)}T${pad(p.hour)}:${pad(p.minute)}:${pad(p.second)}` +
    (p.micro ? `.${pad(p.micro, 6)}` : '');
  if (p.offset !== null) {
    if (p.offset === 0) out += 'Z';
    else {
      const abs = Math.abs(p.offset);
      out += `${p.offset < 0 ? '-' : '+'}${pad(Math.floor(abs / 60))}:${pad(abs % 60)}`;
    }
  }
  return out;
}

/** Returns `YYYY-MM-DD` if Pydantic would accept the value as a `date`, else null. */
export function normalizeDateInput(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const p = parseIsoDatetime(value);
  if (!p) return null;
  if (p.hour || p.minute || p.second || p.micro) return null;
  return `${pad(p.year, 4)}-${pad(p.month)}-${pad(p.day)}`;
}

/** Pydantic v2 parsing + serialization of a `date` field. */
export function serializeDate(value: unknown): string {
  const normalized = normalizeDateInput(value);
  if (normalized === null) throw new Error(`Invalid date: '${String(value)}'`);
  return normalized;
}

/** `datetime.now(timezone.utc).date()` as `YYYY-MM-DD`. */
export function todayUtc(now: Date = new Date()): string {
  return `${now.getUTCFullYear()}-${pad(now.getUTCMonth() + 1)}-${pad(now.getUTCDate())}`;
}

/** Today's calendar day in Argentina (fixed UTC-3, no DST since 2009). */
export function todayInArgentina(now: Date = new Date()): string {
  return todayUtc(new Date(now.getTime() - 3 * 60 * 60 * 1000));
}

/** Compares tuples element-wise like Python does (code-point string order). */
export function compareTuples(a: Array<string | number>, b: Array<string | number>): number {
  for (let i = 0; i < Math.min(a.length, b.length); i++) {
    const x = a[i];
    const y = b[i];
    if (x < y) return -1;
    if (x > y) return 1;
  }
  return a.length - b.length;
}

/** Python `sorted(items, key=key, reverse=reverse)`: stable in both directions. */
export function pySorted<T>(items: T[], key: (item: T) => Array<string | number>, reverse = false): T[] {
  const sign = reverse ? -1 : 1;
  return [...items].sort((a, b) => sign * compareTuples(key(a), key(b)));
}
