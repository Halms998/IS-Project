import { NextFunction, Request, Response } from 'express';
import { ApiError } from '../types';

export function notFound(_req: Request, _res: Response, next: NextFunction): void {
  next(new ApiError(404, 'NOT_FOUND', 'That route does not exist.'));
}

// Turns every error into the same JSON shape: { "error": { "code": "...", "message": "..." } }.
// Unexpected errors are logged but never shown to the client.
// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function errorHandler(error: unknown, _req: Request, res: Response, _next: NextFunction): void {
  if (error instanceof ApiError) {
    res.status(error.status).json({ error: { code: error.code, message: error.message } });
    return;
  }
  const bodyError = error as { type?: string; status?: number };
  if (bodyError.type === 'entity.parse.failed') {
    res.status(400).json({ error: { code: 'INVALID_JSON', message: 'The request body is not valid JSON.' } });
    return;
  }
  if (bodyError.type === 'entity.too.large') {
    res.status(413).json({ error: { code: 'BODY_TOO_LARGE', message: 'The request body is too large.' } });
    return;
  }
  console.error('Unexpected error:', error);
  res.status(500).json({ error: { code: 'INTERNAL_ERROR', message: 'Something went wrong on the server.' } });
}
