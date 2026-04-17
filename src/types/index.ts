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
} as const;

export type ErrorCode = (typeof ERROR_CODES)[keyof typeof ERROR_CODES];
