import { Permission, Role } from '@prisma/client';
import { prisma } from '../config/prisma';

export async function findAllRoles() {
  return prisma.role.findMany({ include: { rolePermissions: { include: { permission: true } } } });
}

export async function findRoleByName(name: string): Promise<Role | null> {
  return prisma.role.findUnique({ where: { name } });
}

export async function findRoleById(id: string): Promise<Role | null> {
  return prisma.role.findUnique({ where: { id } });
}

export async function createRole(name: string, description?: string): Promise<Role> {
  return prisma.role.create({ data: { name, description } });
}

export async function updateRole(id: string, data: Partial<Pick<Role, 'name' | 'description'>>): Promise<Role> {
  return prisma.role.update({ where: { id }, data });
}

export async function deleteRole(id: string): Promise<void> {
  await prisma.role.delete({ where: { id } });
}

export async function assignRoleToUser(
  userId: string,
  roleId: string,
  grantedBy: string
): Promise<void> {
  await prisma.userRole.upsert({
    where: { userId_roleId: { userId, roleId } },
    update: {},
    create: { userId, roleId, grantedBy },
  });
}

export async function revokeRoleFromUser(userId: string, roleId: string): Promise<void> {
  await prisma.userRole.delete({ where: { userId_roleId: { userId, roleId } } });
}

export async function getPermissionsForUser(userId: string): Promise<string[]> {
  const userRoles = await prisma.userRole.findMany({
    where: { userId },
    include: {
      role: {
        include: {
          rolePermissions: {
            include: { permission: true },
          },
        },
      },
    },
  });

  const permissions = new Set<string>();
  for (const ur of userRoles) {
    for (const rp of ur.role.rolePermissions) {
      permissions.add(rp.permission.name);
    }
  }
  return Array.from(permissions);
}

export async function findAllPermissions(): Promise<Permission[]> {
  return prisma.permission.findMany();
}

export async function createPermission(name: string, description?: string): Promise<Permission> {
  return prisma.permission.create({ data: { name, description } });
}

export async function assignPermissionToRole(roleId: string, permissionId: string): Promise<void> {
  await prisma.rolePermission.upsert({
    where: { roleId_permissionId: { roleId, permissionId } },
    update: {},
    create: { roleId, permissionId },
  });
}

export async function revokePermissionFromRole(roleId: string, permissionId: string): Promise<void> {
  await prisma.rolePermission.delete({
    where: { roleId_permissionId: { roleId, permissionId } },
  });
}

export async function getUserRoles(userId: string): Promise<Role[]> {
  const userRoles = await prisma.userRole.findMany({
    where: { userId },
    include: { role: true },
  });
  return userRoles.map((ur) => ur.role);
}
