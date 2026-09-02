import { Router } from 'express';
import * as orderTrackingController from '../controllers/orderTracking.controller';
import * as invoicePlanController from '../controllers/invoicePlan.controller';
import { requireAuth } from '../middleware/authenticate';
import { requireRole } from '../middleware/authorize';
import { requirePasswordChanged } from '../middleware/passwordChanged';
import { ORDER_TRACKING_READ_ROLES as READ_ROLES, ORDER_TRACKING_FULL_WRITE_ROLES as FULL_WRITE_ROLES } from '../utils/roles';

const router = Router();

router.use(requireAuth);
router.use(requirePasswordChanged());

// sales_rep gets read access (service layer scopes it to their own records via
// salesRepCode); accounting/supervisor are read-only here too — only
// accounting_supervisor/admin/super_admin can create/edit OrderTracking or its
// InvoicePlan lines.

router.post('/', requireRole(...FULL_WRITE_ROLES), orderTrackingController.createOrderTracking);
router.get('/', requireRole(...READ_ROLES), orderTrackingController.listOrderTrackings);
router.get('/:id', requireRole(...READ_ROLES), orderTrackingController.getOrderTracking);
router.patch('/:id', requireRole(...FULL_WRITE_ROLES), orderTrackingController.updateOrderTracking);
router.post('/:id/sync', requireRole(...FULL_WRITE_ROLES), orderTrackingController.syncOrderTracking);

// Nested under OrderTracking's base path since a plan line always belongs to one.
router.post('/:id/invoice-plans', requireRole(...FULL_WRITE_ROLES), invoicePlanController.createInvoicePlan);

export default router;
