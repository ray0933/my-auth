import { NextFunction, Request, Response } from 'express';
import * as adminService from '../services/admin.service';
import * as roleService from '../services/role.service';
import { adminCreateUserSchema, updateUserSchema } from '../utils/validators';
import { parsePageParams } from '../utils/pagination';
import { z } from 'zod';

type ParamReq = Request<{ id: string; roleId?: string; permId?: string }>;

export async function createUser(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const dto = adminCreateUserSchema.parse(req.body);
    const user = await adminService.createUser(dto, req.user.sub);
    res.status(201).json({ success: true, data: user });
  } catch (err) {
    next(err);
  }
}

export async function listUsers(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { page, limit } = parsePageParams(req.query);
    const result = await adminService.listUsers(page, limit);
    res.json(result);
  } catch (err) {
    next(err);
  }
}

export async function getUser(req: ParamReq, res: Response, next: NextFunction): Promise<void> {
  try {
    const user = await adminService.getUserById(req.params.id);
    res.json({ success: true, data: user });
  } catch (err) {
    next(err);
  }
}

export async function updateUser(req: ParamReq, res: Response, next: NextFunction): Promise<void> {
  try {
    const data = updateUserSchema.parse(req.body);
    const user = await adminService.updateUser(req.params.id, data, req.user.sub);
    res.json({ success: true, data: user });
  } catch (err) {
    next(err);
  }
}

export async function deleteUser(req: ParamReq, res: Response, next: NextFunction): Promise<void> {
  try {
    await adminService.deleteUser(req.params.id);
    res.status(204).send();
  } catch (err) {
    next(err);
  }
}

export async function assignRole(req: ParamReq, res: Response, next: NextFunction): Promise<void> {
  try {
    const { roleId } = z.object({ roleId: z.string() }).parse(req.body);
    await adminService.assignRole(req.params.id, roleId, req.user.sub);
    res.json({ success: true, data: null });
  } catch (err) {
    next(err);
  }
}

export async function revokeRole(req: ParamReq, res: Response, next: NextFunction): Promise<void> {
  try {
    await adminService.revokeRole(req.params.id, req.params.roleId!, req.user.sub);
    res.json({ success: true, data: null });
  } catch (err) {
    next(err);
  }
}

export async function unlockAccount(req: ParamReq, res: Response, next: NextFunction): Promise<void> {
  try {
    await adminService.unlockAccount(req.params.id);
    res.json({ success: true, data: null });
  } catch (err) {
    next(err);
  }
}

export async function forcePasswordReset(req: ParamReq, res: Response, next: NextFunction): Promise<void> {
  try {
    await adminService.forcePasswordReset(req.params.id, req.user.sub);
    res.json({ success: true, data: null });
  } catch (err) {
    next(err);
  }
}

export async function listRoles(_req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const roles = await roleService.listRoles();
    res.json({ success: true, data: roles });
  } catch (err) {
    next(err);
  }
}

export async function createRole(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { name, description } = z.object({ name: z.string(), description: z.string().optional() }).parse(req.body);
    const role = await roleService.createRole(name, description);
    res.status(201).json({ success: true, data: role });
  } catch (err) {
    next(err);
  }
}

export async function updateRole(req: ParamReq, res: Response, next: NextFunction): Promise<void> {
  try {
    const data = z.object({ name: z.string().optional(), description: z.string().optional() }).parse(req.body);
    const role = await roleService.updateRole(req.params.id, data);
    res.json({ success: true, data: role });
  } catch (err) {
    next(err);
  }
}

export async function deleteRole(req: ParamReq, res: Response, next: NextFunction): Promise<void> {
  try {
    await roleService.deleteRole(req.params.id);
    res.status(204).send();
  } catch (err) {
    next(err);
  }
}

export async function listPermissions(_req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const permissions = await roleService.listPermissions();
    res.json({ success: true, data: permissions });
  } catch (err) {
    next(err);
  }
}

export async function createPermission(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { name, description } = z.object({ name: z.string(), description: z.string().optional() }).parse(req.body);
    const permission = await roleService.createPermission(name, description);
    res.status(201).json({ success: true, data: permission });
  } catch (err) {
    next(err);
  }
}

export async function assignPermissionToRole(req: ParamReq, res: Response, next: NextFunction): Promise<void> {
  try {
    const { permissionId } = z.object({ permissionId: z.string() }).parse(req.body);
    await roleService.assignPermissionToRole(req.params.id, permissionId);
    res.json({ success: true, data: null });
  } catch (err) {
    next(err);
  }
}

export async function revokePermissionFromRole(req: ParamReq, res: Response, next: NextFunction): Promise<void> {
  try {
    await roleService.revokePermissionFromRole(req.params.id, req.params.permId!);
    res.json({ success: true, data: null });
  } catch (err) {
    next(err);
  }
}
