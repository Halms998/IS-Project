import { createHash, timingSafeEqual } from 'crypto';
import { NextFunction, Request, Response } from 'express';
import { AuditService } from '../services/auditService';
import { ApiError } from '../types';

// Protects admin routes with a shared secret sent in the x-admin-key header. Both sides are
// hashed first so the comparison takes the same time whatever the key looks like.
export function requireAdmin(adminApiKey: string, audit: AuditService) {
  const expected = createHash('sha256').update(adminApiKey).digest();
  return (req: Request, _res: Response, next: NextFunction): void => {
    const supplied = req.header('x-admin-key') ?? '';
    const actual = createHash('sha256').update(supplied).digest();
    if (!timingSafeEqual(expected, actual)) {
      audit.record(null, 'ADMIN_AUTH_FAILED', `${req.method} ${req.path}`);
      next(new ApiError(401, 'UNAUTHORIZED', 'A valid admin key is required for this action.'));
      return;
    }
    next();
  };
}
