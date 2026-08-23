import { NextFunction, Request, Response } from 'express';
import * as invoiceService from '../services/invoice.service';
import { issueInvoiceSchema, voidInvoiceSchema } from '../utils/validators';
import { parsePageParams } from '../utils/pagination';
import { getCallerContext } from '../utils/callerContext';

type ParamReq = Request<{ id: string }>;

export async function issueInvoice(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const dto = issueInvoiceSchema.parse(req.body);
    const invoice = await invoiceService.issueInvoice(dto, req.user.sub);
    res.status(201).json({ success: true, data: invoice });
  } catch (err) {
    next(err);
  }
}

export async function listInvoices(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { page, limit } = parsePageParams(req.query);
    const filter = {
      orderTrackingId: req.query['orderTrackingId'] as string | undefined,
      status: req.query['status'] as string | undefined,
    };
    const caller = await getCallerContext(req);
    const result = await invoiceService.listInvoices(page, limit, filter, caller);
    res.json(result);
  } catch (err) {
    next(err);
  }
}

export async function getInvoice(req: ParamReq, res: Response, next: NextFunction): Promise<void> {
  try {
    const caller = await getCallerContext(req);
    const invoice = await invoiceService.getInvoiceById(req.params.id, caller);
    res.json({ success: true, data: invoice });
  } catch (err) {
    next(err);
  }
}

export async function voidInvoice(req: ParamReq, res: Response, next: NextFunction): Promise<void> {
  try {
    const dto = voidInvoiceSchema.parse(req.body);
    const invoice = await invoiceService.voidInvoice(req.params.id, dto, req.user.sub);
    res.json({ success: true, data: invoice });
  } catch (err) {
    next(err);
  }
}

export async function deleteInvoice(req: ParamReq, res: Response, next: NextFunction): Promise<void> {
  try {
    await invoiceService.deleteInvoice(req.params.id, req.user.sub);
    res.status(204).send();
  } catch (err) {
    next(err);
  }
}
