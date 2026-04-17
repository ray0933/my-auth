import 'dotenv/config';
import { env } from './config/env';
import { prisma } from './config/prisma';
import { createApp } from './app';
import pino from 'pino';

const logger = pino({ level: env.LOG_LEVEL });

async function connectWithRetry(maxAttempts = 5): Promise<void> {
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      await prisma.$connect();
      logger.info('Database connected');
      return;
    } catch (err) {
      if (attempt === maxAttempts) throw err;
      const delay = Math.min(1000 * 2 ** attempt, 30000);
      logger.warn({ attempt, delay }, 'DB connection failed, retrying...');
      await new Promise((r) => setTimeout(r, delay));
    }
  }
}

async function main() {
  await connectWithRetry();

  const app = createApp();
  const server = app.listen(env.PORT, () => {
    logger.info(`Server listening on port ${env.PORT}`);
  });

  const shutdown = async () => {
    logger.info('Shutting down...');
    server.close(async () => {
      await prisma.$disconnect();
      process.exit(0);
    });
  };

  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);
}

main().catch((err) => {
  logger.error(err, 'Failed to start server');
  process.exit(1);
});
