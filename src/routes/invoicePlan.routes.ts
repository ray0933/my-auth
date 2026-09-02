import { Router } from 'express';
import * as invoicePlanController from '../controllers/invoicePlan.controller';
import { requireAuth } from '../middleware/authenticate';
import { requireRole } from '../middleware/authorize';
import { requirePasswordChanged } from '../middleware/passwordChanged';
import { ORDER_TRACKING_READ_ROLES as READ_WRITE_ROLES, ORDER_TRACKING_FULL_WRITE_ROLES as FULL_WRITE_ROLES } from '../utils/roles';

const router = Router();

router.use(requireAuth);
router.use(requirePasswordChanged());

// sales_rep, supervisor, and accounting all pass this gate for GET/PATCH; the service
// layer then enforces the finer-grained rule (sales_rep: own records + notes/
// estimatedCompletionDate only; supervisor: any record + notes/estimatedCompletionDate
// only; accounting: read-only, PATCH always 403 since it has no invoice_plans:write*
// permission at all).

router.get('/', requireRole(...READ_WRITE_ROLES), invoicePlanController.listInvoicePlans);
router.patch('/:id', requireRole(...READ_WRITE_ROLES), invoicePlanController.updateInvoicePlan);
router.delete('/:id', requireRole(...FULL_WRITE_ROLES), invoicePlanController.deleteInvoicePlan);

export default router;
