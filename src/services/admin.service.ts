import * as userRepo from '../repositories/user.repository';
import * as roleRepo from '../repositories/role.repository';
import * as tokenRepo from '../repositories/token.repository';
import { AdminCreateUserDto, PaginatedResponse, UserDto } from '../types';
import { AppError } from '../utils/AppError';
import { generateTempPassword, hashPassword } from '../utils/crypto';
import { sendWelcomeEmail } from '../utils/email';
import { log } from './audit.service';

function toUserDto(user: {
  id: string;
  email: string;
  displayName: string | null;
  mustChangePassword: boolean;
  isActive: boolean;
  employeeCode: string | null;
  createdAt: Date;
}, roles: string[]): UserDto {
  return {
    id: user.id,
    email: user.email,
    displayName: user.displayName,
    roles,
    mustChangePassword: user.mustChangePassword,
    isActive: user.isActive,
    employeeCode: user.employeeCode,
    createdAt: user.createdAt,
  };
}

export async function createUser(dto: AdminCreateUserDto, actorId: string): Promise<UserDto> {
  const existing = await userRepo.findByEmail(dto.email);
  if (existing) throw new AppError('EMAIL_TAKEN', 409);

  const tempPassword = generateTempPassword();
  const passwordHash = await hashPassword(tempPassword);

  const user = await userRepo.create({
    email: dto.email,
    passwordHash,
    displayName: dto.displayName,
    mustChangePassword: true,
    createdById: actorId,
    employeeCode: dto.employeeCode,
    roles: dto.roles,
  });

  await sendWelcomeEmail(dto.email, dto.displayName ?? dto.email, tempPassword).catch(() => {});
  await log('user_created', { userId: actorId, metadata: { createdUserId: user.id, roles: dto.roles } });

  const roles = await roleRepo.getUserRoles(user.id);
  return toUserDto(user, roles.map((r) => r.name));
}

export async function listUsers(page: number, limit: number): Promise<PaginatedResponse<UserDto>> {
  const { users, total } = await userRepo.findAll(page, limit);
  const dtos = await Promise.all(
    users.map(async (u) => {
      const roles = await roleRepo.getUserRoles(u.id);
      return toUserDto(u, roles.map((r) => r.name));
    })
  );
  return {
    success: true,
    data: dtos,
    meta: { total, page, limit, totalPages: Math.ceil(total / limit) },
  };
}

export async function getUserById(id: string): Promise<UserDto> {
  const user = await userRepo.findById(id);
  if (!user) throw new AppError('NOT_FOUND', 404);
  const roles = await roleRepo.getUserRoles(id);
  return toUserDto(user, roles.map((r) => r.name));
}

export async function updateUser(
  id: string,
  data: { isActive?: boolean; displayName?: string; employeeCode?: string | null },
  actorId: string
): Promise<UserDto> {
  const user = await userRepo.findById(id);
  if (!user) throw new AppError('NOT_FOUND', 404);

  const updated = await userRepo.update(id, data);

  if (data.isActive !== undefined && data.isActive !== user.isActive) {
    await log(data.isActive ? 'account_enabled' : 'account_disabled', {
      userId: actorId,
      metadata: { targetUserId: id },
    });
  }

  const roles = await roleRepo.getUserRoles(id);
  return toUserDto(updated, roles.map((r) => r.name));
}

export async function deleteUser(id: string): Promise<void> {
  const user = await userRepo.findById(id);
  if (!user) throw new AppError('NOT_FOUND', 404);
  await userRepo.deleteById(id);
}

export async function assignRole(userId: string, roleId: string, actorId: string): Promise<void> {
  const user = await userRepo.findById(userId);
  if (!user) throw new AppError('NOT_FOUND', 404);
  const role = await roleRepo.findRoleById(roleId);
  if (!role) throw new AppError('NOT_FOUND', 404);
  await roleRepo.assignRoleToUser(userId, roleId, actorId);
  await log('role_change', { userId: actorId, metadata: { targetUserId: userId, roleId, action: 'assign' } });
}

export async function revokeRole(userId: string, roleId: string, actorId: string): Promise<void> {
  await roleRepo.revokeRoleFromUser(userId, roleId);
  await log('role_change', { userId: actorId, metadata: { targetUserId: userId, roleId, action: 'revoke' } });
}

export async function unlockAccount(userId: string): Promise<void> {
  const user = await userRepo.findById(userId);
  if (!user) throw new AppError('NOT_FOUND', 404);
  await userRepo.update(userId, { lockedUntil: null, failedAttempts: 0 });
  await log('account_enabled', { userId, metadata: { action: 'unlock' } });
}

export async function forcePasswordReset(userId: string, actorId: string): Promise<void> {
  const user = await userRepo.findById(userId);
  if (!user) throw new AppError('NOT_FOUND', 404);
  await userRepo.update(userId, { mustChangePassword: true });
  await tokenRepo.revokeAllUserTokens(userId);
  await log('password_changed', { userId: actorId, metadata: { targetUserId: userId, action: 'force_reset' } });
}
