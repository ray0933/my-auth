import { env } from '../config/env';
import * as tokenRepo from '../repositories/token.repository';
import * as userRepo from '../repositories/user.repository';
import * as roleRepo from '../repositories/role.repository';
import { ChangePasswordDto, LoginDto, LoginResult, RefreshResult, TokenPair } from '../types';
import { AppError } from '../utils/AppError';
import { hashPassword, hashToken, verifyPassword } from '../utils/crypto';
import { sendPasswordResetEmail } from '../utils/email';
import { validatePasswordComplexity } from '../utils/validators';
import { generateResetToken } from '../utils/crypto';
import { log } from './audit.service';
import * as tokenService from './token.service';

const DUMMY_HASH =
  '$argon2id$v=19$m=65536,t=3,p=4$AAAAAAAAAAAAAAAA$AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA';

export async function login(dto: LoginDto, ip: string, ua: string): Promise<LoginResult> {
  const user = await userRepo.findByEmail(dto.email);

  const hashToVerify = user ? user.passwordHash : DUMMY_HASH;
  const passwordMatch = await verifyPassword(hashToVerify, dto.password);

  if (!user || !passwordMatch) {
    if (user) {
      const updated = await userRepo.incrementFailedAttempts(user.id);
      if (updated.failedAttempts >= env.ACCOUNT_LOCK_THRESHOLD) {
        const until = new Date(Date.now() + env.ACCOUNT_LOCK_DURATION_MIN * 60 * 1000);
        await userRepo.lockAccount(user.id, until);
        await log('account_lock', { userId: user.id, ip, ua });
      } else {
        await log('login_failure', { userId: user.id, ip, ua });
      }
    }
    throw new AppError('INVALID_CREDENTIALS', 401);
  }

  if (!user.isActive) {
    throw new AppError('ACCOUNT_DISABLED', 401);
  }

  if (user.lockedUntil && user.lockedUntil > new Date()) {
    throw new AppError('ACCOUNT_LOCKED', 401);
  }

  await userRepo.resetFailedAttempts(user.id);

  const roles = await roleRepo.getUserRoles(user.id);
  const roleNames = roles.map((r) => r.name);
  const pair = await tokenService.generateTokenPair(user, roleNames, ip, ua);

  await log('login_success', { userId: user.id, ip, ua });

  return {
    accessToken: pair.accessToken,
    refreshToken: pair.refreshToken,
    requiresPasswordChange: user.mustChangePassword,
    user: { id: user.id, email: user.email, displayName: user.displayName, roles: roleNames, mustChangePassword: user.mustChangePassword },
  };
}

export async function changePassword(
  userId: string,
  dto: ChangePasswordDto
): Promise<TokenPair> {
  const user = await userRepo.findById(userId);
  if (!user) throw new AppError('NOT_FOUND', 404);

  const match = await verifyPassword(user.passwordHash, dto.currentPassword);
  if (!match) throw new AppError('INVALID_CREDENTIALS', 401);

  const { valid, errors } = validatePasswordComplexity(dto.newPassword);
  if (!valid) throw new AppError('VALIDATION_ERROR', 400, errors.join('; '));

  const newHash = await hashPassword(dto.newPassword);
  await userRepo.update(userId, { passwordHash: newHash, mustChangePassword: false });
  await tokenRepo.revokeAllUserTokens(userId);

  const roles = await roleRepo.getUserRoles(userId);
  const roleNames = roles.map((r) => r.name);
  const updatedUser = (await userRepo.findById(userId))!;
  const pair = await tokenService.generateTokenPair(updatedUser, roleNames, '', '');

  await log('password_changed', { userId });
  return pair;
}

export async function refresh(rawToken: string, ip: string, ua: string): Promise<RefreshResult> {
  return tokenService.rotateRefreshToken(rawToken, ip, ua);
}

export async function logout(userId: string, rawToken: string): Promise<void> {
  const tokenHash = hashToken(rawToken);
  const stored = await tokenRepo.findRefreshToken(tokenHash);
  if (stored) await tokenRepo.revokeRefreshToken(stored.id);
  await log('logout', { userId });
}

export async function logoutAll(userId: string): Promise<void> {
  await tokenRepo.revokeAllUserTokens(userId);
  await log('logout', { userId });
}

export async function forgotPassword(email: string): Promise<void> {
  const user = await userRepo.findByEmail(email);
  if (!user) return;

  const rawToken = generateResetToken();
  const tokenHash = hashToken(rawToken);
  const expiresAt = new Date(Date.now() + 60 * 60 * 1000);

  await tokenRepo.createPasswordResetToken(user.id, tokenHash, expiresAt);
  const resetLink = `${env.FRONTEND_URL}/reset-password?token=${rawToken}`;
  await sendPasswordResetEmail(email, resetLink).catch(() => {});
  await log('password_reset_request', { userId: user.id });
}

export async function resetPassword(token: string, newPassword: string): Promise<void> {
  const tokenHash = hashToken(token);
  const record = await tokenRepo.findPasswordResetToken(tokenHash);
  if (!record) throw new AppError('TOKEN_EXPIRED', 401);

  await tokenRepo.markResetTokenUsed(record.id);

  const { valid, errors } = validatePasswordComplexity(newPassword);
  if (!valid) throw new AppError('VALIDATION_ERROR', 400, errors.join('; '));

  const newHash = await hashPassword(newPassword);
  await userRepo.update(record.userId, {
    passwordHash: newHash,
    mustChangePassword: false,
  });
  await tokenRepo.revokeAllUserTokens(record.userId);
  await log('password_reset_complete', { userId: record.userId });
}
