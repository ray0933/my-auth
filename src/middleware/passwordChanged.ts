import { NextFunction, Request, RequestHandler, Response } from 'express';
import { AppError } from '../utils/AppError';

export function requirePasswordChanged(): RequestHandler {
  return (req: Request, _res: Response, next: NextFunction): void => {
    if (req.user?.mustChangePassword) {
      return next(new AppError('PASSWORD_CHANGE_REQUIRED', 403));
    }
    next();
  };
}
