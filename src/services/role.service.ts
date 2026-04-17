import { Permission, Role } from '@prisma/client';
import * as roleRepo from '../repositories/role.repository';
import { log } from './audit.service';

export async function getPermissionsForUser(userId: string): Promise<string[]> {
  return roleRepo.getPermissionsForUser(userId);
}

export async function listRoles(): Promise<Role[]> {
  return roleRepo.findAllRoles();
}

export async function createRole(name: string, description?: string): Promise<Role> {
  const role = await roleRepo.createRole(name, description);
  await log('permission_change', { metadata: { action: 'role_created', roleId: role.id, name } });
  return role;
}

export async function updateRole(id: string, data: Partial<Pick<Role, 'name' | 'description'>>): Promise<Role> {
  return roleRepo.updateRole(id, data);
}

export async function deleteRole(id: string): Promise<void> {
  return roleRepo.deleteRole(id);
}

export async function listPermissions(): Promise<Permission[]> {
  return roleRepo.findAllPermissions();
}

export async function createPermission(name: string, description?: string): Promise<Permission> {
  return roleRepo.createPermission(name, description);
}

export async function assignPermissionToRole(roleId: string, permissionId: string): Promise<void> {
  await roleRepo.assignPermissionToRole(roleId, permissionId);
  await log('permission_change', { metadata: { action: 'assigned', roleId, permissionId } });
}

export async function revokePermissionFromRole(roleId: string, permissionId: string): Promise<void> {
  await roleRepo.revokePermissionFromRole(roleId, permissionId);
  await log('permission_change', { metadata: { action: 'revoked', roleId, permissionId } });
}
