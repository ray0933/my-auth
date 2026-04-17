import { Router } from 'express';
import * as authController from '../controllers/auth.controller';
import { requireAuth } from '../middleware/authenticate';
import { authRateLimiter } from '../middleware/rateLimiter';

const router = Router();

router.use(authRateLimiter);

router.post('/login', authController.login);
router.post('/refresh', authController.refresh);
router.post('/logout', requireAuth, authController.logout);
router.post('/logout-all', requireAuth, authController.logoutAll);
router.post('/forgot-password', authController.forgotPassword);
router.post('/reset-password', authController.resetPassword);
router.post('/mfa/setup', requireAuth, authController.mfaSetup);
router.post('/mfa/verify', requireAuth, authController.mfaVerify);
router.post('/mfa/disable', requireAuth, authController.mfaDisable);

export default router;
