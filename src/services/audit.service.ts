import { prisma } from '../config/prisma';
import pino from 'pino';

const logger = pino({ level: process.env.LOG_LEVEL || 'info' });

export type AuditEventType =
  | 'user_created'
  | 'login_success'
  | 'login_failure'
  | 'logout'
  | 'token_refresh'
  | 'password_reset_request'
  | 'password_reset_complete'
  | 'password_changed'
  | 'role_change'
  | 'permission_change'
  | 'account_lock'
  | 'account_enabled'
  | 'account_disabled';

interface AuditOptions {
  userId?: string;
  ip?: string;
  ua?: string;
  metadata?: Record<string, unknown>;
}

export async function log(event: AuditEventType, opts: AuditOptions = {}): Promise<void> {
  try {
    await prisma.auditLog.create({
      data: {
        eventType: event,
        userId: opts.userId,
        ipAddress: opts.ip,
        userAgent: opts.ua,
        metadata: opts.metadata ? JSON.stringify(opts.metadata) : undefined,
      },
    });
  } catch (err) {
    logger.error({ err, event }, 'Failed to write audit log');
  }
}
