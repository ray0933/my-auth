import { NextFunction, Request, Response } from 'express';
import * as invoicePlanService from '../services/invoicePlan.service';
import { createInvoicePlanSchema, updateInvoicePlanSchema } from '../utils/validators';
import { parsePageParams } from '../utils/pagination';
import { getCallerContext } from '../utils/callerContext';

type ParamReq = Request<{ id: string }>;

/** Mounted under /order-trackings/:id/invoice-plans — see orderTracking.routes.ts. */
export async function createInvoicePlan(req: ParamReq, res: Response, next: NextFunction): Promise<void> {
  try {
    const dto = createInvoicePlanSchema.parse(req.body);
    const plan = await invoicePlanService.createInvoicePlan(req.params.id, dto, req.user.sub);
    res.status(201).json({ success: true, data: plan });
  } catch (err) {
    next(err);
  }
}

export async function listInvoicePlans(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { page, limit } = parsePageParams(req.query);
    const filter = {
      orderTrackingId: req.query['orderTrackingId'] as string | undefined,
      status: req.query['status'] as string | undefined,
    };
    const caller = await getCallerContext(req);
    const result = await invoicePlanService.listInvoicePlans(page, limit, filter, caller);
    res.json(result);
  } catch (err) {
    next(err);
  }
}

export async function updateInvoicePlan(req: ParamReq, res: Response, next: NextFunction): Promise<void> {
  try {
    const dto = updateInvoicePlanSchema.parse(req.body);
    const caller = await getCallerContext(req);
    const plan = await invoicePlanService.updateInvoicePlan(req.params.id, dto, caller, req.user.sub);
    res.json({ success: true, data: plan });
  } catch (err) {
    next(err);
  }
}

export async function deleteInvoicePlan(req: ParamReq, res: Response, next: NextFunction): Promise<void> {
  try {
    await invoicePlanService.deleteInvoicePlan(req.params.id, req.user.sub);
    res.status(204).send();
  } catch (err) {
    next(err);
  }
}
