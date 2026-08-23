import { NextFunction, Request, Response } from 'express';
import * as orderTrackingService from '../services/orderTracking.service';
import { createOrderTrackingSchema, updateOrderTrackingSchema } from '../utils/validators';
import { parsePageParams } from '../utils/pagination';
import { getCallerContext } from '../utils/callerContext';

type ParamReq = Request<{ id: string }>;

export async function createOrderTracking(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const dto = createOrderTrackingSchema.parse(req.body);
    const orderTracking = await orderTrackingService.createOrderTracking(dto, req.user.sub);
    res.status(201).json({ success: true, data: orderTracking });
  } catch (err) {
    next(err);
  }
}

export async function listOrderTrackings(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { page, limit } = parsePageParams(req.query);
    const filter = {
      orderType: req.query['orderType'] as string | undefined,
      orderNumber: req.query['orderNumber'] as string | undefined,
      salesRepCode: req.query['salesRepCode'] as string | undefined,
    };
    const caller = await getCallerContext(req);
    const result = await orderTrackingService.listOrderTrackings(page, limit, filter, caller);
    res.json(result);
  } catch (err) {
    next(err);
  }
}

export async function getOrderTracking(req: ParamReq, res: Response, next: NextFunction): Promise<void> {
  try {
    const caller = await getCallerContext(req);
    const orderTracking = await orderTrackingService.getOrderTrackingById(req.params.id, caller);
    res.json({ success: true, data: orderTracking });
  } catch (err) {
    next(err);
  }
}

export async function updateOrderTracking(req: ParamReq, res: Response, next: NextFunction): Promise<void> {
  try {
    const dto = updateOrderTrackingSchema.parse(req.body);
    const orderTracking = await orderTrackingService.updateOrderTracking(req.params.id, dto, req.user.sub);
    res.json({ success: true, data: orderTracking });
  } catch (err) {
    next(err);
  }
}

export async function syncOrderTracking(req: ParamReq, res: Response, next: NextFunction): Promise<void> {
  try {
    const orderTracking = await orderTrackingService.syncOrderTracking(req.params.id, req.user.sub);
    res.json({ success: true, data: orderTracking });
  } catch (err) {
    next(err);
  }
}
