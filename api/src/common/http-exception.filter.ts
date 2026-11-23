import { ArgumentsHost, Catch, ExceptionFilter, HttpException, Logger } from '@nestjs/common';
import type { Response } from 'express';

/**
 * Renders every error the way FastAPI/Starlette did:
 * - `HTTPException(detail=...)` -> `{"detail": ...}` with its status.
 * - Framework HTTP errors (e.g. unknown route) -> `{"detail": "<reason phrase>"}`.
 * - Anything else -> 500 `text/plain` "Internal Server Error".
 */
@Catch()
export class FastApiExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger('ExceptionFilter');

  catch(exception: unknown, host: ArgumentsHost): void {
    const response = host.switchToHttp().getResponse<Response>();

    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      const body = exception.getResponse();
      if (body && typeof body === 'object' && 'detail' in body) {
        response.status(status).json({ detail: (body as { detail: unknown }).detail });
        return;
      }
      response.status(status).json({ detail: REASON_PHRASES[status] ?? exception.message });
      return;
    }

    this.logger.error(exception instanceof Error ? (exception.stack ?? exception.message) : String(exception));
    response.status(500).type('text/plain').send('Internal Server Error');
  }
}

export const REASON_PHRASES: Record<number, string> = {
  400: 'Bad Request',
  401: 'Unauthorized',
  403: 'Forbidden',
  404: 'Not Found',
  405: 'Method Not Allowed',
  413: 'Request Entity Too Large',
  415: 'Unsupported Media Type',
  422: 'Unprocessable Entity',
  500: 'Internal Server Error',
};
