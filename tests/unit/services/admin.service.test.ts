import { describe, it, expect, vi, beforeEach } from 'vitest';
import { AppError } from '../../../src/utils/AppError';

vi.mock('../../../src/repositories/user.repository');
vi.mock('../../../src/repositories/role.repository');
vi.mock('../../../src/repositories/token.repository');
vi.mock('../../../src/services/audit.service');
vi.mock('../../../src/utils/email', () => ({
  sendWelcomeEmail: vi.fn().mockResolvedValue(undefined),
  sendPasswordResetEmail: vi.fn().mockResolvedValue(undefined),
}));

import * as userRepo from '../../../src/repositories/user.repository';
import * as roleRepo from '../../../src/repositories/role.repository';
import * as tokenRepo from '../../../src/repositories/token.repository';
import * as adminService from '../../../src/services/admin.service';

const mockRole = { id: 'role-1', name: 'user', description: null, createdAt: new Date() };
const mockUser = {
  id: 'user-new',
  email: 'new@example.com',
  passwordHash: 'hash',
  displayName: null,
  mustChangePassword: true,
  isActive: true,
  lockedUntil: null,
  failedAttempts: 0,
  mfaSecret: null,
  myBossId: null,
  createdById: 'actor-1',
  createdAt: new Date(),
  updatedAt: new Date(),
};

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(roleRepo.getUserRoles).mockResolvedValue([mockRole]);
  vi.mocked(userRepo.create).mockResolvedValue(mockUser);
  vi.mocked(userRepo.findByEmail).mockResolvedValue(null);
});

describe('adminService.createUser', () => {
  it('creates user with mustChangePassword=true and welcome email queued', async () => {
    const dto = { email: 'new@example.com', roles: ['user'] };
    const result = await adminService.createUser(dto, 'actor-1');
    expect(result.mustChangePassword).toBe(true);
    expect(userRepo.create).toHaveBeenCalled();
  });

  it('throws EMAIL_TAKEN on duplicate email', async () => {
    vi.mocked(userRepo.findByEmail).mockResolvedValue(mockUser);
    const dto = { email: 'new@example.com', roles: ['user'] };
    await expect(adminService.createUser(dto, 'actor-1')).rejects.toMatchObject({ code: 'EMAIL_TAKEN' });
  });
});

describe('adminService.forcePasswordReset', () => {
  it('sets mustChangePassword and revokes sessions', async () => {
    vi.mocked(userRepo.findById).mockResolvedValue(mockUser);
    vi.mocked(userRepo.update).mockResolvedValue({ ...mockUser, mustChangePassword: true });
    vi.mocked(tokenRepo.revokeAllUserTokens).mockResolvedValue();

    await adminService.forcePasswordReset('user-new', 'actor-1');
    expect(userRepo.update).toHaveBeenCalledWith('user-new', { mustChangePassword: true });
    expect(tokenRepo.revokeAllUserTokens).toHaveBeenCalledWith('user-new');
  });

  it('throws NOT_FOUND for unknown user', async () => {
    vi.mocked(userRepo.findById).mockResolvedValue(null);
    await expect(adminService.forcePasswordReset('no-one', 'actor-1')).rejects.toMatchObject({
      code: 'NOT_FOUND',
    });
  });
});
