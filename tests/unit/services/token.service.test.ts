import { describe, it, expect, vi, beforeEach } from 'vitest';
import { AppError } from '../../../src/utils/AppError';

vi.mock('../../../src/repositories/token.repository');
vi.mock('../../../src/repositories/role.repository');
vi.mock('../../../src/services/audit.service');
vi.mock('../../../src/config/prisma', () => ({
  prisma: {
    user: {
      findUniqueOrThrow: vi.fn(),
    },
  },
}));

import * as tokenRepo from '../../../src/repositories/token.repository';
import * as roleRepo from '../../../src/repositories/role.repository';
import { prisma } from '../../../src/config/prisma';
import * as tokenService from '../../../src/services/token.service';
import { hashToken } from '../../../src/utils/crypto';

const mockUser = {
  id: 'user-1',
  email: 'test@example.com',
  passwordHash: 'hash',
  displayName: null,
  mustChangePassword: false,
  isActive: true,
  lockedUntil: null,
  failedAttempts: 0,
  mfaSecret: null,
  myBossId: null,
  createdById: null,
  createdAt: new Date(),
  updatedAt: new Date(),
};

const mockRole = { id: 'role-1', name: 'user', description: null, createdAt: new Date() };

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(tokenRepo.createRefreshToken).mockResolvedValue({} as never);
  vi.mocked(roleRepo.getUserRoles).mockResolvedValue([mockRole]);
  vi.mocked(prisma.user.findUniqueOrThrow).mockResolvedValue(mockUser);
});

describe('tokenService.generateTokenPair', () => {
  it('stores SHA-256 hash of refresh token', async () => {
    const pair = await tokenService.generateTokenPair(mockUser, ['user'], '127.0.0.1', 'ua');
    expect(pair.accessToken).toBeTruthy();
    expect(pair.refreshToken).toBeTruthy();

    expect(tokenRepo.createRefreshToken).toHaveBeenCalledWith(
      expect.objectContaining({
        tokenHash: hashToken(pair.refreshToken),
      })
    );
  });
});

describe('tokenService.rotateRefreshToken', () => {
  it('throws TOKEN_EXPIRED if token not found', async () => {
    vi.mocked(tokenRepo.findRefreshToken).mockResolvedValue(null);
    await expect(tokenService.rotateRefreshToken('raw', '127.0.0.1', 'ua')).rejects.toMatchObject({
      code: 'TOKEN_EXPIRED',
    });
  });

  it('revokes entire family when revoked token is replayed', async () => {
    vi.mocked(tokenRepo.findRefreshToken).mockResolvedValue({
      id: 'rt-1',
      userId: 'user-1',
      tokenHash: 'h',
      familyId: 'fam-1',
      issuedAt: new Date(),
      expiresAt: new Date(Date.now() + 10000),
      revokedAt: new Date(),
      ipAddress: null,
      userAgent: null,
    });
    vi.mocked(tokenRepo.revokeTokenFamily).mockResolvedValue();

    await expect(tokenService.rotateRefreshToken('raw', '127.0.0.1', 'ua')).rejects.toMatchObject({
      code: 'TOKEN_REVOKED',
    });
    expect(tokenRepo.revokeTokenFamily).toHaveBeenCalledWith('fam-1');
  });

  it('throws TOKEN_EXPIRED for expired token', async () => {
    vi.mocked(tokenRepo.findRefreshToken).mockResolvedValue({
      id: 'rt-1',
      userId: 'user-1',
      tokenHash: 'h',
      familyId: 'fam-1',
      issuedAt: new Date(),
      expiresAt: new Date(Date.now() - 1000),
      revokedAt: null,
      ipAddress: null,
      userAgent: null,
    });

    await expect(tokenService.rotateRefreshToken('raw', '127.0.0.1', 'ua')).rejects.toMatchObject({
      code: 'TOKEN_EXPIRED',
    });
  });
});
