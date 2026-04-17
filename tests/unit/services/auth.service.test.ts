import { describe, it, expect, vi, beforeEach } from 'vitest';
import { AppError } from '../../../src/utils/AppError';

vi.mock('../../../src/repositories/user.repository');
vi.mock('../../../src/repositories/token.repository');
vi.mock('../../../src/repositories/role.repository');
vi.mock('../../../src/services/audit.service');
vi.mock('../../../src/services/token.service');
vi.mock('../../../src/utils/email', () => ({
  sendWelcomeEmail: vi.fn().mockResolvedValue(undefined),
  sendPasswordResetEmail: vi.fn().mockResolvedValue(undefined),
}));
vi.mock('../../../src/config/env', () => ({
  env: {
    ACCOUNT_LOCK_THRESHOLD: 5,
    ACCOUNT_LOCK_DURATION_MIN: 15,
    REFRESH_TOKEN_TTL: 604800,
    FRONTEND_URL: 'http://localhost:3000',
    JWT_PRIVATE_KEY: Buffer.from('test').toString('base64'),
    JWT_PUBLIC_KEY: Buffer.from('test').toString('base64'),
  },
}));

import * as userRepo from '../../../src/repositories/user.repository';
import * as tokenRepo from '../../../src/repositories/token.repository';
import * as roleRepo from '../../../src/repositories/role.repository';
import * as tokenService from '../../../src/services/token.service';
import * as authService from '../../../src/services/auth.service';
import { hashPassword } from '../../../src/utils/crypto';

const mockRole = { id: 'role-1', name: 'user', description: null, createdAt: new Date() };

async function makeUser(overrides = {}) {
  return {
    id: 'user-1',
    email: 'test@example.com',
    passwordHash: await hashPassword('ValidPass1!'),
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
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(roleRepo.getUserRoles).mockResolvedValue([mockRole]);
  vi.mocked(tokenService.generateTokenPair).mockResolvedValue({
    accessToken: 'access-token',
    refreshToken: 'refresh-token',
  });
});

describe('authService.login', () => {
  it('succeeds with valid credentials', async () => {
    const user = await makeUser();
    vi.mocked(userRepo.findByEmail).mockResolvedValue(user);
    vi.mocked(userRepo.resetFailedAttempts).mockResolvedValue(user);

    const result = await authService.login({ email: user.email, password: 'ValidPass1!' }, '127.0.0.1', 'test');
    expect(result.accessToken).toBe('access-token');
    expect(result.requiresPasswordChange).toBe(false);
  });

  it('throws INVALID_CREDENTIALS on wrong password', async () => {
    const user = await makeUser();
    vi.mocked(userRepo.findByEmail).mockResolvedValue(user);
    vi.mocked(userRepo.incrementFailedAttempts).mockResolvedValue({ ...user, failedAttempts: 1 });

    await expect(
      authService.login({ email: user.email, password: 'WrongPass1!' }, '127.0.0.1', 'test')
    ).rejects.toThrow(AppError);
  });

  it('throws ACCOUNT_DISABLED for inactive user', async () => {
    const user = await makeUser({ isActive: false });
    vi.mocked(userRepo.findByEmail).mockResolvedValue(user);
    vi.mocked(userRepo.resetFailedAttempts).mockResolvedValue(user);

    await expect(
      authService.login({ email: user.email, password: 'ValidPass1!' }, '127.0.0.1', 'test')
    ).rejects.toMatchObject({ code: 'ACCOUNT_DISABLED' });
  });

  it('throws ACCOUNT_LOCKED for locked user', async () => {
    const until = new Date(Date.now() + 60_000);
    const user = await makeUser({ lockedUntil: until });
    vi.mocked(userRepo.findByEmail).mockResolvedValue(user);
    vi.mocked(userRepo.resetFailedAttempts).mockResolvedValue(user);

    await expect(
      authService.login({ email: user.email, password: 'ValidPass1!' }, '127.0.0.1', 'test')
    ).rejects.toMatchObject({ code: 'ACCOUNT_LOCKED' });
  });

  it('locks account on 5th failure', async () => {
    const user = await makeUser({ failedAttempts: 4 });
    vi.mocked(userRepo.findByEmail).mockResolvedValue(user);
    vi.mocked(userRepo.incrementFailedAttempts).mockResolvedValue({ ...user, failedAttempts: 5 });
    vi.mocked(userRepo.lockAccount).mockResolvedValue(user);

    await expect(
      authService.login({ email: user.email, password: 'WrongPass1!' }, '127.0.0.1', 'test')
    ).rejects.toMatchObject({ code: 'INVALID_CREDENTIALS' });
    expect(userRepo.lockAccount).toHaveBeenCalled();
  });
});

describe('authService.changePassword', () => {
  it('changes password successfully', async () => {
    const user = await makeUser();
    vi.mocked(userRepo.findById).mockResolvedValue(user);
    vi.mocked(userRepo.update).mockResolvedValue({ ...user, mustChangePassword: false });
    vi.mocked(tokenRepo.revokeAllUserTokens).mockResolvedValue();
    vi.mocked(tokenService.generateTokenPair).mockResolvedValue({ accessToken: 'new-at', refreshToken: 'new-rt' });

    const result = await authService.changePassword('user-1', {
      currentPassword: 'ValidPass1!',
      newPassword: 'NewValidPass1!',
    });
    expect(result.accessToken).toBe('new-at');
  });

  it('throws INVALID_CREDENTIALS on wrong current password', async () => {
    const user = await makeUser();
    vi.mocked(userRepo.findById).mockResolvedValue(user);

    await expect(
      authService.changePassword('user-1', { currentPassword: 'WrongPass1!', newPassword: 'NewValidPass1!' })
    ).rejects.toMatchObject({ code: 'INVALID_CREDENTIALS' });
  });

  it('throws VALIDATION_ERROR on weak new password', async () => {
    const user = await makeUser();
    vi.mocked(userRepo.findById).mockResolvedValue(user);

    await expect(
      authService.changePassword('user-1', { currentPassword: 'ValidPass1!', newPassword: 'weak' })
    ).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
  });
});

describe('authService.forgotPassword', () => {
  it('sends reset email when user exists', async () => {
    const user = await makeUser();
    vi.mocked(userRepo.findByEmail).mockResolvedValue(user);
    vi.mocked(tokenRepo.createPasswordResetToken).mockResolvedValue({} as never);

    await authService.forgotPassword('test@example.com');
    expect(tokenRepo.createPasswordResetToken).toHaveBeenCalled();
  });

  it('is silent when user not found (anti-enumeration)', async () => {
    vi.mocked(userRepo.findByEmail).mockResolvedValue(null);

    await expect(authService.forgotPassword('nobody@example.com')).resolves.toBeUndefined();
  });
});
