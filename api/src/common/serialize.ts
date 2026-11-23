/**
 * Small helpers used by the per-model serializers, which play the role of
 * FastAPI's `response_model`: only declared fields are returned, in
 * declaration order, with missing optionals as `null` and dates/datetimes
 * rendered the way Pydantic does.
 */
export { serializeDate, serializeDatetime } from './py-compat';

/** Optional field with a `None` default. */
export const opt = <T>(value: T | undefined): T | null => (value === undefined ? null : value);

/** Optional list field with a `default_factory=list`. */
export const list = <T>(value: T[] | undefined): T[] => (value === undefined ? [] : value);
