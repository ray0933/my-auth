import { Router } from 'express';
import * as invoicePlanController from '../controllers/invoicePlan.controller';
import { requireAuth } from '../middleware/authenticate';
import { requireRole } from '../middleware/authorize';
import { requirePasswordChanged } from '../middleware/passwordChanged';

const router = Router();

router.use(requireAuth);
router.use(requirePasswordChanged());

// sales_rep and accounting both pass this gate for GET/PATCH; the service layer then
// enforces the finer-grained rule (sales_rep: own records + notes-only; accounting:
// read-only, PATCH always 403 since it has no invoice_plans:write* permission at all).
const READ_WRITE_ROLES = ['sales_rep', 'accounting', 'accounting_supervisor', 'admin', 'super_admin'];
const FULL_WRITE_ROLES = ['accounting_supervisor', 'admin', 'super_admin'];

router.get('/', requireRole(...READ_WRITE_ROLES), invoicePlanController.listInvoicePlans);
router.patch('/:id', requireRole(...READ_WRITE_ROLES), invoicePlanController.updateInvoicePlan);
router.delete('/:id', requireRole(...FULL_WRITE_ROLES), invoicePlanController.deleteInvoicePlan);

export default router;
