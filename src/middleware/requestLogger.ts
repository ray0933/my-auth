import { NextFunction, Request, Response } from 'express';
import pinoHttp from 'pino-http';
import { v4 as uuidv4 } from 'uuid';
import { env } from '../config/env';

const httpLogger = pinoHttp({
  level: env.LOG_LEVEL,
  genReqId: () => uuidv4(),
  redact: {
    paths: ['req.headers.authorization', 'req.body.password', 'req.body.currentPassword', 'req.body.newPassword'],
    censor: '[REDACTED]',
  },
});

export function requestLogger(req: Request, res: Response, next: NextFunction): void {
  httpLogger(req, res);
  next();
}
