import { Router } from 'express';
import * as invoiceController from '../controllers/invoice.controller';
import { requireAuth } from '../middleware/authenticate';
import { requireRole } from '../middleware/authorize';
import { requirePasswordChanged } from '../middleware/passwordChanged';

const router = Router();

router.use(requireAuth);
router.use(requirePasswordChanged());

const READ_ROLES = ['sales_rep', 'accounting', 'accounting_supervisor', 'admin', 'super_admin'];
const MANAGE_ROLES = ['accounting', 'accounting_supervisor', 'admin', 'super_admin'];

router.post('/', requireRole(...MANAGE_ROLES), invoiceController.issueInvoice);
router.get('/', requireRole(...READ_ROLES), invoiceController.listInvoices);
router.get('/:id', requireRole(...READ_ROLES), invoiceController.getInvoice);
router.patch('/:id', requireRole(...MANAGE_ROLES), invoiceController.updateInvoice);
router.post('/:id/void', requireRole(...MANAGE_ROLES), invoiceController.voidInvoice);
router.delete('/:id', requireRole(...MANAGE_ROLES), invoiceController.deleteInvoice);

export default router;
