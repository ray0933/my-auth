import { NextFunction, Request, Response } from 'express';
import * as authService from '../services/auth.service';
import { AppError } from '../utils/AppError';
import { loginSchema, forgotPasswordSchema, resetPasswordSchema } from '../utils/validators';
import { env } from '../config/env';

const COOKIE_NAME = 'refreshToken';

const cookieOptions = {
  httpOnly: true,
  secure: env.NODE_ENV === 'production',
  sameSite: 'strict' as const,
  maxAge: env.REFRESH_TOKEN_TTL * 1000,
  path: '/',
};

function getIp(req: Request): string {
  return (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() ?? req.ip ?? '';
}

export async function login(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const dto = loginSchema.parse(req.body);
    const result = await authService.login(dto, getIp(req), req.headers['user-agent'] ?? '');
    res.cookie(COOKIE_NAME, result.refreshToken, cookieOptions);
    res.json({ success: true, data: { accessToken: result.accessToken, requiresPasswordChange: result.requiresPasswordChange, user: result.user } });
  } catch (err) {
    next(err);
  }
}

export async function refresh(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const rawToken = req.cookies?.[COOKIE_NAME];
    if (!rawToken) return next(new AppError('TOKEN_MISSING', 401));
    const pair = await authService.refresh(rawToken, getIp(req), req.headers['user-agent'] ?? '');
    res.cookie(COOKIE_NAME, pair.refreshToken, cookieOptions);
    res.json({ success: true, data: { accessToken: pair.accessToken, user: pair.user } });
  } catch (err) {
    next(err);
  }
}

export async function logout(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const rawToken = req.cookies?.[COOKIE_NAME] ?? '';
    await authService.logout(req.user.sub, rawToken);
    res.clearCookie(COOKIE_NAME, { path: '/' });
    res.json({ success: true, data: null });
  } catch (err) {
    next(err);
  }
}

export async function logoutAll(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    await authService.logoutAll(req.user.sub);
    res.clearCookie(COOKIE_NAME, { path: '/' });
    res.json({ success: true, data: null });
  } catch (err) {
    next(err);
  }
}

export async function forgotPassword(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { email } = forgotPasswordSchema.parse(req.body);
    await authService.forgotPassword(email);
    res.json({ success: true, data: null });
  } catch (err) {
    next(err);
  }
}

export async function resetPassword(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { token, newPassword } = resetPasswordSchema.parse(req.body);
    await authService.resetPassword(token, newPassword);
    res.json({ success: true, data: null });
  } catch (err) {
    next(err);
  }
}

export async function mfaSetup(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { generateTotpSecret, buildOtpAuthUri } = await import('../utils/totp');
    const { prisma } = await import('../config/prisma');
    const secret = generateTotpSecret();
    await prisma.user.update({ where: { id: req.user.sub }, data: { mfaSecret: secret } });
    const otpAuthUrl = buildOtpAuthUri(secret, req.user.email, 'MyAuth');
    res.json({ success: true, data: { otpAuthUrl } });
  } catch (err) {
    next(err);
  }
}

export async function mfaVerify(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { verifyTotpCode } = await import('../utils/totp');
    const { prisma } = await import('../config/prisma');
    const user = await prisma.user.findUniqueOrThrow({ where: { id: req.user.sub } });
    if (!user.mfaSecret) return next(new AppError('NOT_FOUND', 404));
    const isValid = verifyTotpCode(user.mfaSecret, req.body.code as string);
    if (!isValid) return next(new AppError('INVALID_CREDENTIALS', 401));
    res.json({ success: true, data: { verified: true } });
  } catch (err) {
    next(err);
  }
}

export async function mfaDisable(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { prisma } = await import('../config/prisma');
    const { verifyPassword } = await import('../utils/crypto');
    const user = await prisma.user.findUniqueOrThrow({ where: { id: req.user.sub } });
    const match = await verifyPassword(user.passwordHash, (req.body as { password?: string }).password ?? '');
    if (!match) return next(new AppError('INVALID_CREDENTIALS', 401));
    await prisma.user.update({ where: { id: req.user.sub }, data: { mfaSecret: null } });
    res.json({ success: true, data: null });
  } catch (err) {
    next(err);
  }
}
