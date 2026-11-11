import { z } from 'zod';

const email = z.string().trim().email().max(254).transform((value) => value.toLowerCase());
const password = z.string().min(12, 'Use at least 12 characters').max(72, 'Password must be 72 characters or fewer')
  .refine((value) => Buffer.byteLength(value, 'utf8') <= 72, 'Password must be 72 bytes or fewer');

export const registerSchema = z.object({
  name: z.string().trim().min(2).max(80),
  email,
  password,
  phone: z.string().trim().max(30).optional().default(''),
}).strict();

export const loginSchema = z.object({
  email,
  password: z.string().min(1).max(72).refine((value) => Buffer.byteLength(value, 'utf8') <= 72, 'Password must be 72 bytes or fewer'),
}).strict();
export const profileSchema = z.object({
  name: z.string().trim().min(2).max(80).optional(),
  phone: z.string().trim().max(30).optional(),
}).strict().refine((value) => Object.keys(value).length > 0, 'Provide at least one profile field to update');
export const requestResetSchema = z.object({ email }).strict();
export const resetPasswordSchema = z.object({ token: z.string().min(32).max(256), password }).strict();
