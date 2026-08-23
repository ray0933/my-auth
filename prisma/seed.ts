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
  { name: 'sales_rep', description: '業務，僅能查看與標註自己名下的訂單追蹤資料' },
  { name: 'accounting', description: '會計，可完整管理發票（含刪除），並唯讀瀏覽訂單追蹤與發票計畫' },
  { name: 'accounting_supervisor', description: '會計主管，可完整管理所有訂單追蹤、發票計畫與發票' },
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
  // Order/Invoice tracking (Phase 1)
  { name: 'order_tracking:create', description: 'Create order tracking records (from ERP snapshot)' },
  { name: 'order_tracking:read', description: 'Read all order tracking records' },
  { name: 'order_tracking:read_own', description: "Read own (salesRepCode-scoped) order tracking records" },
  { name: 'order_tracking:write', description: 'Edit order tracking notes/orderType, resync ERP snapshot' },
  { name: 'invoice_plans:create', description: 'Create invoice plan lines' },
  { name: 'invoice_plans:read', description: 'Read all invoice plan lines' },
  { name: 'invoice_plans:read_own', description: 'Read own (salesRepCode-scoped) invoice plan lines' },
  { name: 'invoice_plans:write', description: 'Edit pending invoice plan lines (any field)' },
  { name: 'invoice_plans:write_own_notes', description: 'Edit the notes/estimatedCompletionDate fields of own invoice plan lines' },
  { name: 'invoice_plans:delete', description: 'Delete pending invoice plan lines' },
  { name: 'invoices:create', description: 'Issue an invoice from a pending invoice plan line' },
  { name: 'invoices:read', description: 'Read all invoices' },
  { name: 'invoices:read_own', description: 'Read own (salesRepCode-scoped) invoices' },
  { name: 'invoices:void', description: 'Void an issued invoice' },
  { name: 'invoices:delete', description: 'Permanently delete an invoice (distinct from void)' },
];

const rolePermissions: Record<string, string[]> = {
  super_admin: [
    'users:create', 'users:read', 'users:write', 'users:delete', 'roles:read', 'roles:write', 'permissions:write', 'audit:read',
    'order_tracking:create', 'order_tracking:read', 'order_tracking:write',
    'invoice_plans:create', 'invoice_plans:read', 'invoice_plans:write', 'invoice_plans:delete',
    'invoices:create', 'invoices:read', 'invoices:void', 'invoices:delete',
  ],
  admin: [
    'users:create', 'users:read', 'users:write', 'roles:read', 'audit:read',
    'order_tracking:create', 'order_tracking:read', 'order_tracking:write',
    'invoice_plans:create', 'invoice_plans:read', 'invoice_plans:write', 'invoice_plans:delete',
    'invoices:create', 'invoices:read', 'invoices:void', 'invoices:delete',
  ],
  user: ['users:read'],
  sales_rep: ['order_tracking:read_own', 'invoice_plans:read_own', 'invoice_plans:write_own_notes', 'invoices:read_own'],
  accounting: ['order_tracking:read', 'invoice_plans:read', 'invoices:create', 'invoices:read', 'invoices:void', 'invoices:delete'],
  accounting_supervisor: [
    'order_tracking:create', 'order_tracking:read', 'order_tracking:write',
    'invoice_plans:create', 'invoice_plans:read', 'invoice_plans:write', 'invoice_plans:delete',
    'invoices:create', 'invoices:read', 'invoices:void', 'invoices:delete',
  ],
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
