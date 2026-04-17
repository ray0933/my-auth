import { Prisma, User } from '@prisma/client';
import { prisma } from '../config/prisma';

export interface CreateUserData {
  email: string;
  passwordHash: string;
  displayName?: string;
  mustChangePassword?: boolean;
  createdById?: string;
  roles: string[];
}

export async function findByEmail(email: string): Promise<User | null> {
  return prisma.user.findUnique({ where: { email } });
}

export async function findById(id: string): Promise<User | null> {
  return prisma.user.findUnique({ where: { id } });
}

export async function create(data: CreateUserData): Promise<User> {
  const { roles, ...userData } = data;
  return prisma.$transaction(async (tx) => {
    const user = await tx.user.create({ data: userData });
    for (const roleName of roles) {
      const role = await tx.role.findUnique({ where: { name: roleName } });
      if (role) {
        await tx.userRole.create({
          data: { userId: user.id, roleId: role.id, grantedBy: data.createdById },
        });
      }
    }
    return user;
  });
}

export async function update(id: string, data: Prisma.UserUpdateInput): Promise<User> {
  return prisma.user.update({ where: { id }, data });
}

export async function incrementFailedAttempts(id: string): Promise<User> {
  return prisma.user.update({ where: { id }, data: { failedAttempts: { increment: 1 } } });
}

export async function lockAccount(id: string, until: Date): Promise<User> {
  return prisma.user.update({ where: { id }, data: { lockedUntil: until } });
}

export async function resetFailedAttempts(id: string): Promise<User> {
  return prisma.user.update({
    where: { id },
    data: { failedAttempts: 0, lockedUntil: null },
  });
}

export async function findAll(
  page: number,
  limit: number
): Promise<{ users: User[]; total: number }> {
  const [users, total] = await Promise.all([
    prisma.user.findMany({ skip: (page - 1) * limit, take: limit, orderBy: { createdAt: 'desc' } }),
    prisma.user.count(),
  ]);
  return { users, total };
}

export async function deleteById(id: string): Promise<void> {
  await prisma.user.delete({ where: { id } });
}
