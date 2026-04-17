import { Router } from 'express';
import * as userController from '../controllers/user.controller';
import { requireAuth } from '../middleware/authenticate';
import { requirePasswordChanged } from '../middleware/passwordChanged';

const router = Router();

router.use(requireAuth);

router.post('/me/change-password', userController.changePassword);

router.use(requirePasswordChanged());

router.get('/me', userController.getMe);
router.patch('/me', userController.updateMe);

export default router;
