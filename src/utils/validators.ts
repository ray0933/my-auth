import { z } from 'zod';

export function validateEmail(email: string): boolean {
  return z.string().email().safeParse(email).success;
}

export function validatePasswordComplexity(password: string): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  if (password.length < 8) errors.push('Password must be at least 8 characters');
  if (password.length > 128) errors.push('Password must be at most 128 characters');
  if (!/[A-Z]/.test(password)) errors.push('Password must contain at least one uppercase letter');
  if (!/[a-z]/.test(password)) errors.push('Password must contain at least one lowercase letter');
  if (!/[0-9]/.test(password)) errors.push('Password must contain at least one digit');
  if (!/[!@#$%^&*()_+\-=\[\]{}|;':",./<>?]/.test(password))
    errors.push('Password must contain at least one special character');

  return { valid: errors.length === 0, errors };
}

export const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

export const adminCreateUserSchema = z.object({
  email: z.string().email(),
  displayName: z.string().optional(),
  roles: z.array(z.string()).default([]),
  employeeCode: z.string().optional(),
});

export const changePasswordSchema = z.object({
  currentPassword: z.string().min(1),
  newPassword: z.string().min(8).max(128),
});

export const forgotPasswordSchema = z.object({
  email: z.string().email(),
});

export const resetPasswordSchema = z.object({
  token: z.string().min(1),
  newPassword: z.string().min(8).max(128),
});

export const updateUserSchema = z.object({
  displayName: z.string().optional(),
  isActive: z.boolean().optional(),
  employeeCode: z.string().nullable().optional(),
});

// ---------------------------------------------------------------------------
// Order/Invoice tracking (Phase 1)
// ---------------------------------------------------------------------------

export const ORDER_TYPES = ['general', 'maintenance', 'installment'] as const;

export const createOrderTrackingSchema = z.object({
  orderNumber: z.string().min(1),
  orderType: z.enum(ORDER_TYPES),
  notes: z.string().optional(),
});

export const updateOrderTrackingSchema = z.object({
  orderType: z.enum(ORDER_TYPES).optional(),
  notes: z.string().optional(),
});

export const createInvoicePlanSchema = z.object({
  plannedMonth: z.coerce.date(),
  estimatedCompletionDate: z.coerce.date(),
  plannedAmount: z.coerce.number().positive(),
  notes: z.string().optional(),
});

export const updateInvoicePlanSchema = z.object({
  plannedMonth: z.coerce.date().optional(),
  estimatedCompletionDate: z.coerce.date().optional(),
  plannedAmount: z.coerce.number().positive().optional(),
  notes: z.string().optional(),
});

export const issueInvoiceSchema = z.object({
  invoicePlanId: z.string().min(1),
});

export const voidInvoiceSchema = z.object({
  voidReason: z.string().min(1),
});
