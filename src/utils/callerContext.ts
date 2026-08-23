import { Request } from 'express';
import * as userRepo from '../repositories/user.repository';
import { CallerContext } from '../types';

/** Builds the {roles, employeeCode} context OrderTracking/InvoicePlan/Invoice services
 * need for row-level scoping. employeeCode isn't a JWT claim (see types/index.ts), so
 * this looks it up from the User table on each call — only relevant for sales_rep
 * requests, but cheap enough to just always do it rather than special-case by role. */
export async function getCallerContext(req: Request): Promise<CallerContext> {
  const user = await userRepo.findById(req.user.sub);
  return {
    userId: req.user.sub,
    roles: req.user.roles,
    employeeCode: user?.employeeCode ?? null,
  };
}
