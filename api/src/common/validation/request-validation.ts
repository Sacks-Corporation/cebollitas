import {
  applyDecorators,
  CallHandler,
  createParamDecorator,
  ExecutionContext,
  Injectable,
  NestInterceptor,
  SetMetadata,
  UseInterceptors,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';
import { z } from 'zod';
import { httpError } from '../http-errors';
import { PySchema } from './py-schema';

export interface RequestSchemas {
  params?: Record<string, PySchema<any>>;
  query?: Record<string, PySchema<any>>;
  body?: PySchema<any>;
}

export interface PydanticErrorItem {
  type: string;
  loc: Array<string | number>;
  msg: string;
  input: unknown;
  ctx?: Record<string, unknown>;
}

type Part = 'params' | 'query' | 'body';
type ValidatedRequest = Request & { validated?: Partial<Record<Part, unknown>> };

const SCHEMAS_KEY = 'py:request-schemas';
const LOCATION: Record<Part, string> = { params: 'path', query: 'query', body: 'body' };

/** Converts zod issues produced by the py-schema builders into FastAPI error items. */
export function toPydanticErrors(issues: z.core.$ZodIssue[], location: string): PydanticErrorItem[] {
  return issues.map((issue) => {
    const params = (issue as { params?: { type?: string; ctx?: Record<string, unknown> } }).params ?? {};
    const input = (issue as { input?: unknown }).input;
    const item: PydanticErrorItem = {
      type: params.type ?? 'value_error',
      loc: [location, ...(issue.path as Array<string | number>)],
      msg: issue.message,
      input: input === undefined ? null : input,
    };
    if (params.ctx) item.ctx = params.ctx;
    return item;
  });
}

export function validationError(errors: PydanticErrorItem[]) {
  return httpError(422, errors);
}

/** Last value wins for repeated query keys, like Starlette's scalar params. */
function scalar(value: unknown): unknown {
  return Array.isArray(value) ? value[value.length - 1] : value;
}

@Injectable()
export class RequestValidationInterceptor implements NestInterceptor {
  constructor(private readonly reflector: Reflector) {}

  intercept(context: ExecutionContext, next: CallHandler) {
    const schemas = this.reflector.get<RequestSchemas | undefined>(SCHEMAS_KEY, context.getHandler());
    const request = context.switchToHttp().getRequest<ValidatedRequest>();
    if (schemas) request.validated = validateRequest(request, schemas);
    return next.handle();
  }
}

/** Validates path, query and body together and fails with every error at once (FastAPI behavior). */
export function validateRequest(request: Request, schemas: RequestSchemas): Partial<Record<Part, unknown>> {
  const errors: PydanticErrorItem[] = [];
  const validated: Partial<Record<Part, unknown>> = {};

  for (const part of ['params', 'query'] as const) {
    const shape = schemas[part];
    if (!shape) continue;
    const source = (request[part] ?? {}) as Record<string, unknown>;
    const out: Record<string, unknown> = {};
    for (const [key, schema] of Object.entries(shape)) {
      const result = schema.safeParse(scalar(source[key]));
      if (result.success) out[key] = result.data;
      else errors.push(...toPydanticErrors(result.error.issues, LOCATION[part]).map((e) => ({ ...e, loc: [LOCATION[part], key, ...e.loc.slice(1)] })));
    }
    validated[part] = out;
  }

  if (schemas.body) {
    const body = (request as { body?: unknown }).body;
    if (body === undefined) {
      errors.push({ type: 'missing', loc: ['body'], msg: 'Field required', input: null });
    } else {
      const result = schemas.body.safeParse(body);
      if (result.success) validated.body = result.data;
      else errors.push(...toPydanticErrors(result.error.issues, 'body'));
    }
  }

  if (errors.length) throw validationError(errors);
  return validated;
}

/** Declares the Pydantic-like schemas for a route's path params, query and body. */
export const ValidateRequest = (schemas: RequestSchemas) =>
  applyDecorators(SetMetadata(SCHEMAS_KEY, schemas), UseInterceptors(RequestValidationInterceptor));

const validatedPart = (part: Part) =>
  createParamDecorator((_data: unknown, ctx: ExecutionContext) => {
    const request = ctx.switchToHttp().getRequest<ValidatedRequest>();
    return request.validated?.[part];
  });

/** Validated body (output of the route's body schema). */
export const VBody = validatedPart('body');
/** Validated query params. */
export const VQuery = validatedPart('query');
/** Validated path params. */
export const VParams = validatedPart('params');
