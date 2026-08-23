export interface AccessTokenPayload {
  sub: string;
  email: string;
  roles: string[];
  mustChangePassword: boolean;
  iat: number;
  exp: number;
  jti: string;
}

export interface AdminCreateUserDto {
  email: string;
  displayName?: string;
  roles: string[];
  /** ERP employee code — needed for sales_rep row-level scoping (see CallerContext). */
  employeeCode?: string;
}

export interface ChangePasswordDto {
  currentPassword: string;
  newPassword: string;
}

export interface ForgotPasswordDto {
  email: string;
}

export interface ResetPasswordDto {
  token: string;
  newPassword: string;
}

export interface LoginDto {
  email: string;
  password: string;
}

export interface ClientUser {
  id: string;
  email: string;
  displayName: string | null;
  roles: string[];
  mustChangePassword: boolean;
}

export interface LoginResult {
  accessToken: string;
  refreshToken: string;
  requiresPasswordChange: boolean;
  user: ClientUser;
}

export interface TokenPair {
  accessToken: string;
  refreshToken: string;
}

export interface RefreshResult extends TokenPair {
  user: ClientUser;
}

export interface UserDto {
  id: string;
  email: string;
  displayName: string | null;
  roles: string[];
  mustChangePassword: boolean;
  isActive: boolean;
  employeeCode: string | null;
  createdAt: Date;
}

export interface SuccessResponse<T> {
  success: true;
  data: T;
}

export interface ErrorResponse {
  success: false;
  error: {
    code: string;
    message: string;
  };
}

export interface PaginatedResponse<T> {
  success: true;
  data: T[];
  meta: {
    total: number;
    page: number;
    limit: number;
    totalPages: number;
  };
}

export const ERROR_CODES = {
  VALIDATION_ERROR: 'VALIDATION_ERROR',
  INVALID_CREDENTIALS: 'INVALID_CREDENTIALS',
  TOKEN_EXPIRED: 'TOKEN_EXPIRED',
  TOKEN_REVOKED: 'TOKEN_REVOKED',
  TOKEN_MISSING: 'TOKEN_MISSING',
  ACCOUNT_DISABLED: 'ACCOUNT_DISABLED',
  ACCOUNT_LOCKED: 'ACCOUNT_LOCKED',
  FORBIDDEN: 'FORBIDDEN',
  PASSWORD_CHANGE_REQUIRED: 'PASSWORD_CHANGE_REQUIRED',
  NOT_FOUND: 'NOT_FOUND',
  EMAIL_TAKEN: 'EMAIL_TAKEN',
  RATE_LIMITED: 'RATE_LIMITED',
  INTERNAL_ERROR: 'INTERNAL_ERROR',
  ORDER_NOT_FOUND_IN_ERP: 'ORDER_NOT_FOUND_IN_ERP',
  ORDER_TRACKING_DUPLICATE: 'ORDER_TRACKING_DUPLICATE',
  INVOICE_PLAN_NOT_PENDING: 'INVOICE_PLAN_NOT_PENDING',
  INVOICE_ALREADY_VOID: 'INVOICE_ALREADY_VOID',
  INVOICE_NUMBER_TAKEN: 'INVOICE_NUMBER_TAKEN',
} as const;

export type ErrorCode = (typeof ERROR_CODES)[keyof typeof ERROR_CODES];

// ---------------------------------------------------------------------------
// Order/Invoice tracking (Phase 1)
// ---------------------------------------------------------------------------

/** A caller's identity + row-level scoping info, threaded through the
 * OrderTracking/InvoicePlan/Invoice services so they can restrict results to
 * a sales_rep's own records. Not derived from the JWT (employeeCode isn't a
 * token claim) — services look it up from the User table per-request. */
export interface CallerContext {
  userId: string;
  roles: string[];
  employeeCode: string | null;
}

/** Snapshot of ERP order fields fetched by order number, via a read-only VIEW. */
export interface OrderSnapshot {
  orderNumber: string;
  orderDate: Date | null;
  customerShortName: string | null;
  endUser: string | null;
  projectName: string | null;
  salesRepCode: string | null;
  salesRepName: string | null;
  orderAmountUntaxed: string | null;
  estimatedCostUntaxed: string | null;
}

export interface CreateOrderTrackingDto {
  orderNumber: string;
  orderType: string;
  notes?: string;
}

export interface UpdateOrderTrackingDto {
  orderType?: string;
  notes?: string;
}

export interface OrderTrackingDto {
  id: string;
  orderNumber: string;
  orderType: string;
  orderDate: Date | null;
  customerShortName: string | null;
  endUser: string | null;
  projectName: string | null;
  salesRepCode: string | null;
  salesRepName: string | null;
  orderAmountUntaxed: string | null;
  estimatedCostUntaxed: string | null;
  remainingUninvoicedAmount: string | null;
  snapshotAt: Date | null;
  notes: string | null;
  createdById: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface CreateInvoicePlanDto {
  plannedMonth: Date;
  estimatedCompletionDate: Date;
  plannedAmount: number;
  notes?: string;
}

export interface UpdateInvoicePlanDto {
  plannedMonth?: Date;
  estimatedCompletionDate?: Date;
  plannedAmount?: number;
  notes?: string;
}

export interface InvoicePlanDto {
  id: string;
  orderTrackingId: string;
  plannedMonth: Date;
  plannedMonthStr: string;
  estimatedCompletionDate: Date;
  estimatedCompletionMonthStr: string;
  plannedAmount: string;
  status: string;
  invoiceId: string | null;
  notes: string | null;
  createdById: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface IssueInvoiceDto {
  invoicePlanId: string;
  /** Manually entered by the user — this system does not auto-generate invoice
   * numbers (e.g. Taiwan's 統一發票 numbers are allocated outside this system). */
  invoiceNumber: string;
  invoiceDate: Date;
  notes?: string;
}

export interface VoidInvoiceDto {
  voidReason: string;
}

export interface UpdateInvoiceDto {
  notes?: string;
}

export interface InvoiceDto {
  id: string;
  invoiceNumber: string;
  orderTrackingId: string;
  /** Snapshot fields from the linked OrderTracking, joined in for display —
   * not stored redundantly on Invoice itself. */
  orderNumber: string;
  customerShortName: string | null;
  invoiceDate: Date;
  amount: string;
  taxAmount: string;
  totalAmount: string;
  status: string;
  voidedAt: Date | null;
  voidReason: string | null;
  notes: string | null;
  issuedById: string | null;
  createdAt: Date;
  updatedAt: Date;
}
