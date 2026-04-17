import { User } from '@prisma/client';
import { v4 as uuidv4 } from 'uuid';
import { env } from '../config/env';
import * as tokenRepo from '../repositories/token.repository';
import { RefreshResult, TokenPair } from '../types';
import { AppError } from '../utils/AppError';
import { generateRefreshToken, hashToken } from '../utils/crypto';
import { signAccessToken } from '../utils/jwt';
import { log } from './audit.service';
import * as roleRepo from '../repositories/role.repository';

export async function generateTokenPair(
  user: User,
  roles: string[],
  ip: string,
  ua: string,
  familyId?: string
): Promise<TokenPair> {
  const accessToken = signAccessToken({
    sub: user.id,
    email: user.email,
    roles,
    mustChangePassword: user.mustChangePassword,
  });

  const rawRefresh = generateRefreshToken();
  const tokenHash = hashToken(rawRefresh);
  const expiresAt = new Date(Date.now() + env.REFRESH_TOKEN_TTL * 1000);

  await tokenRepo.createRefreshToken({
    userId: user.id,
    tokenHash,
    familyId: familyId ?? uuidv4(),
    expiresAt,
    ipAddress: ip,
    userAgent: ua,
  });

  return { accessToken, refreshToken: rawRefresh };
}

export async function rotateRefreshToken(
  rawToken: string,
  ip: string,
  ua: string
): Promise<RefreshResult> {
  const tokenHash = hashToken(rawToken);
  const stored = await tokenRepo.findRefreshToken(tokenHash);

  if (!stored) {
    throw new AppError('TOKEN_EXPIRED', 401);
  }

  if (stored.revokedAt !== null) {
    await tokenRepo.revokeTokenFamily(stored.familyId);
    throw new AppError('TOKEN_REVOKED', 401);
  }

  if (stored.expiresAt < new Date()) {
    throw new AppError('TOKEN_EXPIRED', 401);
  }

  await tokenRepo.revokeRefreshToken(stored.id);

  const { prisma } = await import('../config/prisma');
  const user = await prisma.user.findUniqueOrThrow({ where: { id: stored.userId } });
  const roles = await roleRepo.getUserRoles(user.id);
  const roleNames = roles.map((r) => r.name);

  const pair = await generateTokenPair(user, roleNames, ip, ua, stored.familyId);
  await log('token_refresh', { userId: user.id, ip, ua });
  return {
    ...pair,
    user: { id: user.id, email: user.email, displayName: user.displayName, roles: roleNames, mustChangePassword: user.mustChangePassword },
  };
}
