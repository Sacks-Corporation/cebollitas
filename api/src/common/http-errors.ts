import { HttpException } from '@nestjs/common';

/** Equivalent of FastAPI's `HTTPException(status_code, detail)`. */
export function httpError(status: number, detail: unknown): HttpException {
  return new HttpException({ detail }, status);
}
