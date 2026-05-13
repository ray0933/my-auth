import { PrismaClient } from '@prisma/client';
import { PrismaMssql } from '@prisma/adapter-mssql';
import argon2 from 'argon2';

export function createTestPrisma(): PrismaClient {
  const url = process.env.DATABASE_URL!;
  const adapter = new PrismaMssql(url);
  return new PrismaClient({ adapter });
}

export async function setupTestDb(prisma: PrismaClient) {
  await prisma.auditLog.deleteMany();
  await prisma.passwordResetToken.deleteMany();
  await prisma.refreshToken.deleteMany();
  await prisma.userRole.deleteMany();
  await prisma.rolePermission.deleteMany();
  await prisma.user.deleteMany();
  await prisma.role.deleteMany();
  await prisma.permission.deleteMany();

  const roles = ['super_admin', 'admin', 'user'].map((name) =>
    prisma.role.create({ data: { name, description: name } })
  );
  const [superAdminRole, adminRole, userRole] = await Promise.all(roles);

  const perms = [
    'users:create', 'users:read', 'users:write', 'users:delete',
    'roles:read', 'roles:write', 'permissions:write', 'audit:read',
  ].map((name) => prisma.permission.create({ data: { name } }));
  const permRecords = await Promise.all(perms);

  const permMap = Object.fromEntries(permRecords.map((p) => [p.name, p]));

  await Promise.all([
    ...Object.values(permMap).map((p) =>
      prisma.rolePermission.create({ data: { roleId: superAdminRole.id, permissionId: p.id } })
    ),
    prisma.rolePermission.create({ data: { roleId: adminRole.id, permissionId: permMap['users:create']!.id } }),
    prisma.rolePermission.create({ data: { roleId: adminRole.id, permissionId: permMap['users:read']!.id } }),
    prisma.rolePermission.create({ data: { roleId: adminRole.id, permissionId: permMap['users:write']!.id } }),
    prisma.rolePermission.create({ data: { roleId: userRole.id, permissionId: permMap['users:read']!.id } }),
  ]);

  return { superAdminRole, adminRole, userRole };
}

export async function createTestUser(
  prisma: PrismaClient,
  opts: {
    email: string;
    password: string;
    roleId: string;
    mustChangePassword?: boolean;
    isActive?: boolean;
  }
) {
  const passwordHash = await argon2.hash(opts.password, { type: argon2.argon2id });
  const user = await prisma.user.create({
    data: {
      email: opts.email,
      passwordHash,
      mustChangePassword: opts.mustChangePassword ?? false,
      isActive: opts.isActive ?? true,
    },
  });
  await prisma.userRole.create({ data: { userId: user.id, roleId: opts.roleId } });
  return user;
}
