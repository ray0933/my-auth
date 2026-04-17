import { describe, it, expect } from 'vitest';
import request from 'supertest';
import rateLimit from 'express-rate-limit';
import cookieParser from 'cookie-parser';
import express from 'express';
import { errorHandler } from '../../../src/middleware/errorHandler';

function createRateLimitedApp(max: number) {
  const app = express();
  app.use(cookieParser());
  app.use(express.json());
  app.use(
    rateLimit({
      windowMs: 60_000,
      max,
      standardHeaders: true,
      legacyHeaders: false,
      handler: (_req, res) => {
        res.status(429).json({
          success: false,
          error: { code: 'RATE_LIMITED', message: 'Too many requests' },
        });
      },
    })
  );
  app.post('/api/v1/auth/login', (_req, res) => res.json({ success: true }));
  app.use(errorHandler);
  return app;
}

describe('Rate limiting', () => {
  it('returns 429 RATE_LIMITED after max requests', async () => {
    const app = createRateLimitedApp(3);
    for (let i = 0; i < 3; i++) {
      await request(app).post('/api/v1/auth/login').send({});
    }
    const res = await request(app).post('/api/v1/auth/login').send({});
    expect(res.status).toBe(429);
    expect(res.body.error.code).toBe('RATE_LIMITED');
  });
});
