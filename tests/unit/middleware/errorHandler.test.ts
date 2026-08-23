import { describe, it, expect, vi } from 'vitest';
import { z } from 'zod';
import { errorHandler } from '../../../src/middleware/errorHandler';
import { AppError } from '../../../src/utils/AppError';

function mockRes() {
  const res: { statusCode?: number; body?: unknown; status: (code: number) => typeof res; json: (body: unknown) => typeof res } = {
    status(code: number) {
      res.statusCode = code;
      return res;
    },
    json(body: unknown) {
      res.body = body;
      return res;
    },
  };
  return res;
}

describe('errorHandler', () => {
  it('maps AppError to its own status code and error code', () => {
    const res = mockRes();
    errorHandler(new AppError('NOT_FOUND', 404), {} as never, res as never, vi.fn());

    expect(res.statusCode).toBe(404);
    expect(res.body).toMatchObject({ success: false, error: { code: 'NOT_FOUND' } });
  });

  it('maps ZodError to 400 VALIDATION_ERROR', () => {
    const res = mockRes();
    const schema = z.object({ orderNumber: z.string().min(1) });
    const parseResult = schema.safeParse({});
    expect(parseResult.success).toBe(false);

    errorHandler(parseResult.error, {} as never, res as never, vi.fn());

    expect(res.statusCode).toBe(400);
    expect(res.body).toMatchObject({ success: false, error: { code: 'VALIDATION_ERROR' } });
  });

  it('falls back to 500 INTERNAL_ERROR for unrecognized errors', () => {
    const res = mockRes();
    errorHandler(new Error('boom'), {} as never, res as never, vi.fn());

    expect(res.statusCode).toBe(500);
    expect(res.body).toMatchObject({ success: false, error: { code: 'INTERNAL_ERROR' } });
  });
});
