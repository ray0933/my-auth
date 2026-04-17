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
  roles: z.array(z.string()).min(1),
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
});
