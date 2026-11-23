/**
 * Pydantic-like schema builders on top of zod.
 *
 * FastAPI validated requests with Pydantic v2 in lax mode. These helpers
 * reproduce the parts the API relied on (coercion rules, constraints, default
 * values, field/model validators and error `type`/`msg`), and emit zod issues
 * whose `params` carry the Pydantic error type so the 422 body keeps the
 * FastAPI shape.
 */
import { z } from 'zod';
import { normalizeDateInput } from '../py-compat';

export type Ctx = z.core.$RefinementCtx<unknown>;
export type PySchema<T> = z.ZodType<T, unknown>;

export function addPyIssue(
  ctx: Ctx,
  type: string,
  msg: string,
  extra: { path?: PropertyKey[]; input?: unknown; ctx?: Record<string, unknown> } = {},
): never {
  ctx.addIssue({
    code: 'custom',
    message: msg,
    path: extra.path as (string | number)[] | undefined,
    input: extra.input,
    params: { type, ctx: extra.ctx },
  });
  return z.NEVER as never;
}

/** Raises a Pydantic `value_error` (what a validator's `raise ValueError(msg)` produced). */
export function valueError(ctx: Ctx, msg: string, input: unknown, path?: PropertyKey[]): never {
  return addPyIssue(ctx, 'value_error', `Value error, ${msg}`, { input, path, ctx: { error: msg } });
}

interface FieldOptions<T> {
  /** Value used when the key is absent. Without it the field is required. */
  default?: T | (() => T);
  /** Accept explicit `null` (Pydantic `X | None`). */
  nullable?: boolean;
}

const MISSING_MSG = 'Field required';

function resolveDefault<T>(def: T | (() => T)): T {
  return typeof def === 'function' ? (def as () => T)() : def;
}

/** Builds a field schema handling missing/null before delegating to `check`. */
type Out<T, O> = O extends { nullable: true } ? T | null : T;

function field<T, O extends FieldOptions<any>>(options: O, check: (value: unknown, ctx: Ctx) => T): PySchema<Out<T, O>> {
  return z.any().transform((value, ctx) => {
    if (value === undefined) {
      if ('default' in options) return resolveDefault(options.default as T);
      return addPyIssue(ctx, 'missing', MISSING_MSG, { input: undefined });
    }
    if (value === null && options.nullable) return null;
    return check(value, ctx);
  }) as unknown as PySchema<Out<T, O>>;
}

const plural = (n: number, word: string): string => `${n} ${word}${n === 1 ? '' : 's'}`;

interface StrOptions extends FieldOptions<any> {
  minLength?: number;
  maxLength?: number;
}

export function pyStr<O extends StrOptions>(options: O = {} as O) {
  return field<string, O>(options, (value, ctx) => {
    if (typeof value !== 'string') return addPyIssue(ctx, 'string_type', 'Input should be a valid string', { input: value });
    const length = [...value].length;
    if (options.minLength !== undefined && length < options.minLength) {
      return addPyIssue(ctx, 'string_too_short', `String should have at least ${plural(options.minLength, 'character')}`, {
        input: value,
        ctx: { min_length: options.minLength },
      });
    }
    if (options.maxLength !== undefined && length > options.maxLength) {
      return addPyIssue(ctx, 'string_too_long', `String should have at most ${plural(options.maxLength, 'character')}`, {
        input: value,
        ctx: { max_length: options.maxLength },
      });
    }
    return value;
  });
}

interface NumOptions extends FieldOptions<any> {
  ge?: number;
  le?: number;
}

function checkBounds(value: number, options: NumOptions, ctx: Ctx): number {
  if (options.ge !== undefined && !(value >= options.ge)) {
    return addPyIssue(ctx, 'greater_than_equal', `Input should be greater than or equal to ${options.ge}`, {
      input: value,
      ctx: { ge: options.ge },
    });
  }
  if (options.le !== undefined && !(value <= options.le)) {
    return addPyIssue(ctx, 'less_than_equal', `Input should be less than or equal to ${options.le}`, {
      input: value,
      ctx: { le: options.le },
    });
  }
  return value;
}

/** Lax `int`: accepts bools, integral floats and numeric strings ("5", " 5 ", "5.0"). */
export function coerceInt(value: unknown, ctx: Ctx): number {
  if (typeof value === 'boolean') return value ? 1 : 0;
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) return addPyIssue(ctx, 'finite_number', 'Input should be a finite number', { input: value });
    if (!Number.isInteger(value)) {
      return addPyIssue(ctx, 'int_from_float', 'Input should be a valid integer, got a number with a fractional part', {
        input: value,
      });
    }
    return value;
  }
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (/^[+-]?\d+(\.0*)?$/.test(trimmed)) return Number.parseInt(trimmed, 10);
    if (/^[+-]?\d+\.\d+$/.test(trimmed)) {
      return addPyIssue(ctx, 'int_from_float', 'Input should be a valid integer, got a number with a fractional part', {
        input: value,
      });
    }
    return addPyIssue(ctx, 'int_parsing', 'Input should be a valid integer, unable to parse string as an integer', {
      input: value,
    });
  }
  return addPyIssue(ctx, 'int_type', 'Input should be a valid integer', { input: value });
}

export function pyInt<O extends NumOptions>(options: O = {} as O) {
  return field<number, O>(options, (value, ctx) => {
    const number = coerceInt(value, ctx);
    // A failed coercion already reported its issue; don't stack a bounds error on top.
    if ((number as unknown) === z.NEVER) return number;
    return checkBounds(number, options, ctx);
  });
}

/** Lax `float`: accepts bools, ints and numeric strings. */
export function pyFloat<O extends NumOptions>(options: O = {} as O) {
  return field<number, O>(options, (value, ctx) => {
    let number: number;
    if (typeof value === 'boolean') number = value ? 1 : 0;
    else if (typeof value === 'number') number = value;
    else if (typeof value === 'string') {
      const trimmed = value.trim();
      if (!/^[+-]?(\d+\.?\d*|\.\d+)([eE][+-]?\d+)?$/.test(trimmed)) {
        return addPyIssue(ctx, 'float_parsing', 'Input should be a valid number, unable to parse string as a number', {
          input: value,
        });
      }
      number = Number(trimmed);
    } else return addPyIssue(ctx, 'float_type', 'Input should be a valid number', { input: value });
    return checkBounds(number, options, ctx);
  });
}

/** Pydantic `date`: `YYYY-MM-DD` (or a zero-time datetime); returns `YYYY-MM-DD`. */
export function pyDate<O extends FieldOptions<any>>(options: O = {} as O) {
  return field<string, O>(options, (value, ctx) => {
    if (typeof value !== 'string') return addPyIssue(ctx, 'date_type', 'Input should be a valid date', { input: value });
    const normalized = normalizeDateInput(value);
    if (normalized === null) {
      return addPyIssue(
        ctx,
        'date_from_datetime_parsing',
        'Input should be a valid date or datetime, input is too short',
        { input: value },
      );
    }
    return normalized;
  });
}

const formatLiteral = (value: string | number): string => (typeof value === 'string' ? `'${value}'` : String(value));

/** Pydantic `Literal[...]` (no string->int coercion, like Pydantic). */
export function pyLiteral<const V extends readonly (string | number)[], O extends FieldOptions<any>>(
  values: V,
  options: O = {} as O,
) {
  const expected =
    values.length === 1
      ? formatLiteral(values[0])
      : `${values.slice(0, -1).map(formatLiteral).join(', ')} or ${formatLiteral(values[values.length - 1])}`;
  return field<V[number], O>(options, (value, ctx) => {
    if ((typeof value === 'string' || typeof value === 'number') && values.includes(value)) return value as V[number];
    return addPyIssue(ctx, 'literal_error', `Input should be ${expected}`, { input: value, ctx: { expected } });
  });
}

interface ListOptions extends FieldOptions<any> {
  minLength?: number;
  maxLength?: number;
}

/** Pydantic `list[T]` with optional min/max length. */
export function pyList<T, O extends ListOptions>(item: PySchema<T>, options: O = {} as O) {
  return field<T[], O>(options, (value, ctx) => {
    if (!Array.isArray(value)) return addPyIssue(ctx, 'list_type', 'Input should be a valid list', { input: value });
    const out: T[] = [];
    let failed = false;
    value.forEach((element, index) => {
      const result = item.safeParse(element);
      if (result.success) out.push(result.data);
      else {
        failed = true;
        forwardIssues(ctx, result.error.issues, [index]);
      }
    });
    if (failed) return z.NEVER as never;
    const actual = value.length;
    if (options.minLength !== undefined && actual < options.minLength) {
      return addPyIssue(ctx, 'too_short', `List should have at least ${plural(options.minLength, 'item')} after validation, not ${actual}`, {
        input: value,
        ctx: { field_type: 'List', min_length: options.minLength, actual_length: actual },
      });
    }
    if (options.maxLength !== undefined && actual > options.maxLength) {
      return addPyIssue(ctx, 'too_long', `List should have at most ${plural(options.maxLength, 'item')} after validation, not ${actual}`, {
        input: value,
        ctx: { field_type: 'List', max_length: options.maxLength, actual_length: actual },
      });
    }
    return out;
  });
}

function forwardIssues(ctx: Ctx, issues: ReadonlyArray<Record<string, any>>, prefix: PropertyKey[]): void {
  for (const issue of issues) {
    const params = (issue as { params?: { type?: string; ctx?: Record<string, unknown> } }).params ?? {};
    addPyIssue(ctx, params.type ?? 'value_error', issue.message, {
      path: [...prefix, ...issue.path],
      input: (issue as { input?: unknown }).input,
      ctx: params.ctx,
    });
  }
}

type Shape = Record<string, PySchema<any>>;
type Infer<S extends Shape> = { [K in keyof S]: z.output<S[K]> };

interface ModelOptions<S extends Shape> {
  /** Pydantic class name (documentation / debugging). */
  name: string;
  /** `model_validator(mode="before")`: reshapes the raw dict. */
  before?: (data: Record<string, unknown>) => Record<string, unknown>;
  /** Per-field `field_validator`s (after type validation). Throw `FieldError` to fail. */
  fieldValidators?: Partial<{ [K in keyof S]: (value: z.output<S[K]>) => z.output<S[K]> }>;
  /** `model_validator(mode="after")`s. Throw `FieldError` to fail. */
  after?: Array<(model: Infer<S>) => Infer<S>>;
}

/** Thrown from validators; becomes a Pydantic `value_error`. */
export class FieldError extends Error {}

/**
 * Pydantic `BaseModel`: ignores extra keys, validates fields in declaration
 * order (so output key order matches `model_dump()`), then runs validators.
 */
export function pyModel<S extends Shape>(shape: S, options: ModelOptions<S>): PySchema<Infer<S>> {
  return z.any().transform((raw, ctx) => {
    if (raw === undefined) return addPyIssue(ctx, 'missing', MISSING_MSG, { input: undefined });
    if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
      // FastAPI validates the decoded body as Python objects, so nested models
      // report this type too (not "model_type").
      return addPyIssue(ctx, 'model_attributes_type', 'Input should be a valid dictionary or object to extract fields from', {
        input: raw,
      });
    }
    const data = options.before ? options.before({ ...(raw as Record<string, unknown>) }) : (raw as Record<string, unknown>);
    const out: Record<string, unknown> = {};
    let failed = false;
    for (const [key, schema] of Object.entries(shape)) {
      const value = Object.prototype.hasOwnProperty.call(data, key) ? data[key] : undefined;
      const result = schema.safeParse(value);
      if (!result.success) {
        failed = true;
        forwardIssues(
          ctx,
          result.error.issues.map((issue) =>
            (issue as { params?: { type?: string } }).params?.type === 'missing' && issue.path.length === 0
              ? { ...issue, input: data }
              : issue,
          ),
          [key],
        );
        continue;
      }
      let fieldValue = result.data;
      const validator = options.fieldValidators?.[key as keyof S];
      if (validator) {
        try {
          fieldValue = validator(fieldValue);
        } catch (error) {
          if (!(error instanceof FieldError)) throw error;
          failed = true;
          valueError(ctx, error.message, value, [key]);
          continue;
        }
      }
      out[key] = fieldValue;
    }
    if (failed) return z.NEVER as never;
    let model = out as Infer<S>;
    for (const validator of options.after ?? []) {
      try {
        model = validator(model);
      } catch (error) {
        if (!(error instanceof FieldError)) throw error;
        return valueError(ctx, error.message, raw);
      }
    }
    return model;
  }) as unknown as PySchema<Infer<S>>;
}
