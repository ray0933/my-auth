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
  // FK-safe order: InvoicePlan/Invoice restrict-delete their OrderTracking, so they
  // must go first.
  await prisma.invoicePlan.deleteMany();
  await prisma.invoice.deleteMany();
  await prisma.orderTracking.deleteMany();
  await prisma.userRole.deleteMany();
  await prisma.rolePermission.deleteMany();
  await prisma.user.deleteMany();
  await prisma.role.deleteMany();
  await prisma.permission.deleteMany();

  const roles = ['super_admin', 'admin', 'user', 'sales_rep', 'accounting', 'accounting_supervisor', 'supervisor'].map(
    (name) => prisma.role.create({ data: { name, description: name } })
  );
  const [superAdminRole, adminRole, userRole, salesRepRole, accountingRole, accountingSupervisorRole, supervisorRole] =
    await Promise.all(roles);

  const perms = [
    'users:create', 'users:read', 'users:write', 'users:delete',
    'roles:read', 'roles:write', 'permissions:write', 'audit:read',
    'order_tracking:create', 'order_tracking:read', 'order_tracking:read_own', 'order_tracking:write',
    'invoice_plans:create', 'invoice_plans:read', 'invoice_plans:read_own', 'invoice_plans:write',
    'invoice_plans:write_own_notes', 'invoice_plans:write_limited', 'invoice_plans:delete',
    'invoices:create', 'invoices:read', 'invoices:read_own', 'invoices:void', 'invoices:delete',
  ].map((name) => prisma.permission.create({ data: { name } }));
  const permRecords = await Promise.all(perms);

  const permMap = Object.fromEntries(permRecords.map((p) => [p.name, p]));

  const grant = (roleId: string, permNames: string[]) =>
    permNames.map((name) => prisma.rolePermission.create({ data: { roleId, permissionId: permMap[name]!.id } }));

  const globalOrderInvoicePerms = [
    'order_tracking:create', 'order_tracking:read', 'order_tracking:write',
    'invoice_plans:create', 'invoice_plans:read', 'invoice_plans:write', 'invoice_plans:delete',
    'invoices:create', 'invoices:read', 'invoices:void', 'invoices:delete',
  ];

  await Promise.all([
    ...Object.values(permMap).map((p) =>
      prisma.rolePermission.create({ data: { roleId: superAdminRole.id, permissionId: p.id } })
    ),
    ...grant(adminRole.id, ['users:create', 'users:read', 'users:write', 'roles:read', 'audit:read', ...globalOrderInvoicePerms]),
    ...grant(userRole.id, ['users:read']),
    ...grant(salesRepRole.id, [
      'order_tracking:read_own', 'invoice_plans:read_own', 'invoice_plans:write_own_notes', 'invoices:read_own',
    ]),
    ...grant(accountingRole.id, [
      'order_tracking:read', 'invoice_plans:read', 'invoices:create', 'invoices:read', 'invoices:void', 'invoices:delete',
    ]),
    ...grant(accountingSupervisorRole.id, globalOrderInvoicePerms),
    ...grant(supervisorRole.id, ['order_tracking:read', 'invoice_plans:read', 'invoice_plans:write_limited', 'invoices:read']),
  ]);

  return {
    superAdminRole,
    adminRole,
    userRole,
    salesRepRole,
    accountingRole,
    accountingSupervisorRole,
    supervisorRole,
  };
}

export async function createTestUser(
  prisma: PrismaClient,
  opts: {
    email: string;
    password: string;
    roleId: string;
    mustChangePassword?: boolean;
    isActive?: boolean;
    employeeCode?: string;
  }
) {
  const passwordHash = await argon2.hash(opts.password, { type: argon2.argon2id });
  const user = await prisma.user.create({
    data: {
      email: opts.email,
      passwordHash,
      mustChangePassword: opts.mustChangePassword ?? false,
      isActive: opts.isActive ?? true,
      employeeCode: opts.employeeCode,
    },
  });
  await prisma.userRole.create({ data: { userId: user.id, roleId: opts.roleId } });
  return user;
}
