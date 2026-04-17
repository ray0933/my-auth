import { Router } from 'express';
import * as adminController from '../controllers/admin.controller';
import { requireAuth } from '../middleware/authenticate';
import { requireRole } from '../middleware/authorize';
import { requirePasswordChanged } from '../middleware/passwordChanged';

const router = Router();

router.use(requireAuth);
router.use(requirePasswordChanged());

// User management
router.post('/users', requireRole('admin', 'super_admin'), adminController.createUser);
router.get('/users', requireRole('admin', 'super_admin'), adminController.listUsers);
router.get('/users/:id', requireRole('admin', 'super_admin'), adminController.getUser);
router.patch('/users/:id', requireRole('admin', 'super_admin'), adminController.updateUser);
router.delete('/users/:id', requireRole('super_admin'), adminController.deleteUser);
router.post('/users/:id/roles', requireRole('admin', 'super_admin'), adminController.assignRole);
router.delete('/users/:id/roles/:roleId', requireRole('admin', 'super_admin'), adminController.revokeRole);
router.post('/users/:id/unlock', requireRole('admin', 'super_admin'), adminController.unlockAccount);
router.post('/users/:id/force-password-reset', requireRole('admin', 'super_admin'), adminController.forcePasswordReset);

// Roles & Permissions
router.get('/roles', requireRole('admin', 'super_admin'), adminController.listRoles);
router.post('/roles', requireRole('super_admin'), adminController.createRole);
router.patch('/roles/:id', requireRole('super_admin'), adminController.updateRole);
router.delete('/roles/:id', requireRole('super_admin'), adminController.deleteRole);
router.get('/permissions', requireRole('admin', 'super_admin'), adminController.listPermissions);
router.post('/permissions', requireRole('super_admin'), adminController.createPermission);
router.post('/roles/:id/permissions', requireRole('super_admin'), adminController.assignPermissionToRole);
router.delete('/roles/:id/permissions/:permId', requireRole('super_admin'), adminController.revokePermissionFromRole);

export default router;
