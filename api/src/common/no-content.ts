import type { Response } from 'express';

/**
 * FastAPI answers `status_code=204` routes with an empty body but still sends
 * `content-type: application/json`. Express's `send()` strips that header on
 * 204, so finish the response directly.
 */
export function sendNoContent(res: Response): void {
  res.status(204).setHeader('Content-Type', 'application/json');
  res.end();
}
