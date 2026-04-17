import { NextFunction, Request, Response } from 'express';
import { AppError } from '../utils/AppError';
import { verifyAccessToken } from '../utils/jwt';

export function requireAuth(req: Request, _res: Response, next: NextFunction): void {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return next(new AppError('TOKEN_MISSING', 401));
  }

  const token = authHeader.slice(7);
  try {
    req.user = verifyAccessToken(token);
    next();
  } catch {
    next(new AppError('TOKEN_EXPIRED', 401));
  }
}
