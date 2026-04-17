import cookieParser from 'cookie-parser';
import express from 'express';
import { prisma } from './config/prisma';
import { errorHandler } from './middleware/errorHandler';
import { requestLogger } from './middleware/requestLogger';
import authRoutes from './routes/auth.routes';
import adminRoutes from './routes/admin.routes';
import userRoutes from './routes/user.routes';

export function createApp() {
  const app = express();

  app.use(express.json());
  app.use(cookieParser());
  app.use(requestLogger);

  app.get('/health', async (_req, res) => {
    try {
      await prisma.$queryRaw`SELECT 1`;
      res.json({ status: 'ok', db: 'connected' });
    } catch {
      res.status(503).json({ status: 'error', db: 'disconnected' });
    }
  });

  app.use('/api/v1/auth', authRoutes);
  app.use('/api/v1/users', userRoutes);
  app.use('/api/v1/admin', adminRoutes);

  app.use(errorHandler);

  return app;
}
