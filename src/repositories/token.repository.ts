import { PasswordResetToken, RefreshToken } from '@prisma/client';
import { prisma } from '../config/prisma';

export interface CreateRefreshTokenData {
  userId: string;
  tokenHash: string;
  familyId: string;
  expiresAt: Date;
  ipAddress?: string;
  userAgent?: string;
}

export async function createRefreshToken(data: CreateRefreshTokenData): Promise<RefreshToken> {
  return prisma.refreshToken.create({ data });
}

export async function findRefreshToken(tokenHash: string): Promise<RefreshToken | null> {
  return prisma.refreshToken.findUnique({ where: { tokenHash } });
}

export async function revokeRefreshToken(id: string): Promise<void> {
  await prisma.refreshToken.update({ where: { id }, data: { revokedAt: new Date() } });
}

export async function revokeTokenFamily(familyId: string): Promise<void> {
  await prisma.refreshToken.updateMany({
    where: { familyId, revokedAt: null },
    data: { revokedAt: new Date() },
  });
}

export async function revokeAllUserTokens(userId: string): Promise<void> {
  await prisma.refreshToken.updateMany({
    where: { userId, revokedAt: null },
    data: { revokedAt: new Date() },
  });
}

export async function createPasswordResetToken(
  userId: string,
  tokenHash: string,
  expiresAt: Date
): Promise<PasswordResetToken> {
  return prisma.passwordResetToken.create({ data: { userId, tokenHash, expiresAt } });
}

export async function findPasswordResetToken(tokenHash: string): Promise<PasswordResetToken | null> {
  return prisma.passwordResetToken.findFirst({
    where: { tokenHash, usedAt: null, expiresAt: { gt: new Date() } },
  });
}

export async function markResetTokenUsed(id: string): Promise<void> {
  await prisma.passwordResetToken.update({ where: { id }, data: { usedAt: new Date() } });
}
