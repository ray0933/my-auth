import nodemailer from 'nodemailer';
import { env } from '../config/env';

const transporter = nodemailer.createTransport({
  host: env.SMTP_HOST,
  port: env.SMTP_PORT,
  secure: env.SMTP_PORT === 465,
  auth: env.SMTP_USER ? { user: env.SMTP_USER, pass: env.SMTP_PASS } : undefined,
});

export async function sendWelcomeEmail(
  to: string,
  displayName: string,
  tempPassword: string
): Promise<void> {
  await transporter.sendMail({
    from: env.SMTP_USER || 'noreply@example.com',
    to,
    subject: 'Welcome — Your Account Has Been Created',
    text: `Hi ${displayName},\n\nYour account has been created.\nTemporary password: ${tempPassword}\n\nPlease log in and change your password immediately.\n\n${env.FRONTEND_URL}`,
  });
}

export async function sendPasswordResetEmail(to: string, resetLink: string): Promise<void> {
  await transporter.sendMail({
    from: env.SMTP_USER || 'noreply@example.com',
    to,
    subject: 'Password Reset Request',
    text: `You requested a password reset.\n\nClick the link below to reset your password (expires in 1 hour):\n${resetLink}\n\nIf you did not request this, you can safely ignore this email.`,
  });
}
