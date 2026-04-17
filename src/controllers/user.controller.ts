import { NextFunction, Request, Response } from 'express';
import * as roleRepo from '../repositories/role.repository';
import * as userRepo from '../repositories/user.repository';
import * as authService from '../services/auth.service';
import { AppError } from '../utils/AppError';
import { changePasswordSchema, updateUserSchema } from '../utils/validators';
import { env } from '../config/env';

const COOKIE_NAME = 'refreshToken';

const cookieOptions = {
  httpOnly: true,
  secure: env.NODE_ENV === 'production',
  sameSite: 'strict' as const,
  maxAge: env.REFRESH_TOKEN_TTL * 1000,
  path: '/',
};

export async function getMe(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const user = await userRepo.findById(req.user.sub);
    if (!user) return next(new AppError('NOT_FOUND', 404));
    const roles = await roleRepo.getUserRoles(user.id);
    res.json({
      success: true,
      data: {
        id: user.id,
        email: user.email,
        displayName: user.displayName,
        roles: roles.map((r) => r.name),
        mustChangePassword: user.mustChangePassword,
        createdAt: user.createdAt,
      },
    });
  } catch (err) {
    next(err);
  }
}

export async function updateMe(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { displayName } = updateUserSchema.parse(req.body);
    const user = await userRepo.update(req.user.sub, { displayName });
    const roles = await roleRepo.getUserRoles(user.id);
    res.json({
      success: true,
      data: {
        id: user.id,
        email: user.email,
        displayName: user.displayName,
        roles: roles.map((r) => r.name),
        mustChangePassword: user.mustChangePassword,
        createdAt: user.createdAt,
      },
    });
  } catch (err) {
    next(err);
  }
}

export async function changePassword(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const dto = changePasswordSchema.parse(req.body);
    const pair = await authService.changePassword(req.user.sub, dto);
    res.cookie(COOKIE_NAME, pair.refreshToken, cookieOptions);
    res.json({ success: true, data: { accessToken: pair.accessToken } });
  } catch (err) {
    next(err);
  }
}
