import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import { PrismaMssql } from '@prisma/adapter-mssql';
import argon2 from 'argon2';

const url = process.env.DATABASE_URL ?? 'sqlserver://localhost:1433;database=authdev;user=sa;password=YourStrong@Password1;trustServerCertificate=true';
const adapter = new PrismaMssql(url);
const prisma = new PrismaClient({ adapter });

const roles = [
  { name: 'super_admin', description: 'Full system access' },
  { name: 'admin', description: 'Administrative access' },
  { name: 'user', description: 'Standard user access' },
];

const permissions = [
  { name: 'users:create', description: 'Create users' },
  { name: 'users:read', description: 'Read users' },
  { name: 'users:write', description: 'Update users' },
  { name: 'users:delete', description: 'Delete users' },
  { name: 'roles:read', description: 'Read roles' },
  { name: 'roles:write', description: 'Manage roles' },
  { name: 'permissions:write', description: 'Manage permissions' },
  { name: 'audit:read', description: 'Read audit logs' },
];

const rolePermissions: Record<string, string[]> = {
  super_admin: ['users:create', 'users:read', 'users:write', 'users:delete', 'roles:read', 'roles:write', 'permissions:write', 'audit:read'],
  admin: ['users:create', 'users:read', 'users:write', 'roles:read', 'audit:read'],
  user: ['users:read'],
};

async function main() {
  console.log('Seeding roles...');
  for (const role of roles) {
    await prisma.role.upsert({ where: { name: role.name }, update: {}, create: role });
  }

  console.log('Seeding permissions...');
  for (const perm of permissions) {
    await prisma.permission.upsert({ where: { name: perm.name }, update: {}, create: perm });
  }

  console.log('Assigning permissions to roles...');
  for (const [roleName, permNames] of Object.entries(rolePermissions)) {
    const role = await prisma.role.findUniqueOrThrow({ where: { name: roleName } });
    for (const permName of permNames) {
      const perm = await prisma.permission.findUniqueOrThrow({ where: { name: permName } });
      await prisma.rolePermission.upsert({
        where: { roleId_permissionId: { roleId: role.id, permissionId: perm.id } },
        update: {},
        create: { roleId: role.id, permissionId: perm.id },
      });
    }
  }

  console.log('Creating super_admin user...');
  const superAdminEmail = process.env.SEED_ADMIN_EMAIL ?? 'admin@example.com';
  const superAdminPassword = process.env.SEED_ADMIN_PASSWORD ?? 'Admin@12345!';
  const passwordHash = await argon2.hash(superAdminPassword, { type: argon2.argon2id });

  const superAdmin = await prisma.user.upsert({
    where: { email: superAdminEmail },
    update: {},
    create: {
      email: superAdminEmail,
      passwordHash,
      displayName: 'Super Admin',
      mustChangePassword: false,
      isActive: true,
    },
  });

  const superAdminRole = await prisma.role.findUniqueOrThrow({ where: { name: 'super_admin' } });
  await prisma.userRole.upsert({
    where: { userId_roleId: { userId: superAdmin.id, roleId: superAdminRole.id } },
    update: {},
    create: { userId: superAdmin.id, roleId: superAdminRole.id },
  });

  console.log(`Seed complete. Super admin: ${superAdminEmail}`);
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
