import { NextFunction, Request, RequestHandler, Response } from 'express';
import * as roleService from '../services/role.service';
import { AppError } from '../utils/AppError';

export function requireRole(...roles: string[]): RequestHandler {
  return (req: Request, _res: Response, next: NextFunction): void => {
    const userRoles = req.user?.roles ?? [];
    const hasRole = roles.some((r) => userRoles.includes(r));
    if (!hasRole) return next(new AppError('FORBIDDEN', 403));
    next();
  };
}

export function requirePermission(permission: string): RequestHandler {
  return async (req: Request, _res: Response, next: NextFunction): Promise<void> => {
    try {
      const permissions = await roleService.getPermissionsForUser(req.user.sub);
      if (!permissions.includes(permission)) return next(new AppError('FORBIDDEN', 403));
      next();
    } catch (err) {
      next(err);
    }
  };
}
