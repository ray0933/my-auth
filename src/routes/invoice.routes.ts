import { Router } from 'express';
import * as invoiceController from '../controllers/invoice.controller';
import { requireAuth } from '../middleware/authenticate';
import { requireRole } from '../middleware/authorize';
import { requirePasswordChanged } from '../middleware/passwordChanged';
import { ORDER_TRACKING_READ_ROLES as READ_ROLES, INVOICE_MANAGE_ROLES as MANAGE_ROLES } from '../utils/roles';

const router = Router();

router.use(requireAuth);
router.use(requirePasswordChanged());

router.post('/', requireRole(...MANAGE_ROLES), invoiceController.issueInvoice);
router.get('/', requireRole(...READ_ROLES), invoiceController.listInvoices);
router.get('/:id', requireRole(...READ_ROLES), invoiceController.getInvoice);
router.patch('/:id', requireRole(...MANAGE_ROLES), invoiceController.updateInvoice);
router.post('/:id/void', requireRole(...MANAGE_ROLES), invoiceController.voidInvoice);
router.delete('/:id', requireRole(...MANAGE_ROLES), invoiceController.deleteInvoice);

export default router;
