import dotenv from 'dotenv';
import { fileURLToPath } from 'node:url';

dotenv.config({ path: fileURLToPath(new URL('../../.env', import.meta.url)) });

const port = Number(process.env.PORT ?? 5000);
if (!Number.isInteger(port) || port < 1 || port > 65535) {
  throw new Error('PORT must be an integer between 1 and 65535');
}

const accessTokenTtl = process.env.ACCESS_TOKEN_TTL ?? '10m';
const accessTtlParts = /^([1-9]\d*)(ms|s|m|h|d)$/.exec(accessTokenTtl);
if (!accessTtlParts) throw new Error('ACCESS_TOKEN_TTL must be a positive duration such as 10m or 1h');
const accessTtlUnitMs = { ms: 1, s: 1000, m: 60_000, h: 3_600_000, d: 86_400_000 }[accessTtlParts[2]];
const accessTokenTtlMs = Number(accessTtlParts[1]) * accessTtlUnitMs;
const refreshTokenDays = Number(process.env.REFRESH_TOKEN_DAYS ?? 30);
const passwordResetMinutes = Number(process.env.PASSWORD_RESET_MINUTES ?? 15);
if (!Number.isSafeInteger(refreshTokenDays) || refreshTokenDays < 1) throw new Error('REFRESH_TOKEN_DAYS must be a positive integer');
if (!Number.isSafeInteger(passwordResetMinutes) || passwordResetMinutes < 1) throw new Error('PASSWORD_RESET_MINUTES must be a positive integer');

export const env = Object.freeze({
  nodeEnv: process.env.NODE_ENV ?? 'development',
  port,
  clientOrigin: process.env.CLIENT_ORIGIN ?? 'http://localhost:5173',
  mongoUri: process.env.MONGODB_URI ?? 'mongodb://127.0.0.1:27017/smart_parking',
  accessTokenTtl,
  accessTokenTtlMs,
  refreshTokenDays,
  passwordResetMinutes,
  smtpHost: process.env.SMTP_HOST ?? '',
  smtpPort: Number(process.env.SMTP_PORT ?? 587),
  smtpSecure: process.env.SMTP_SECURE === 'true',
  smtpUser: process.env.SMTP_USER ?? '',
  smtpPassword: process.env.SMTP_PASSWORD ?? '',
  smtpFrom: process.env.SMTP_FROM ?? 'Parkwise <no-reply@example.com>',
  razorpayMode: process.env.RAZORPAY_MODE ?? 'test',
  razorpayKeyId: process.env.RAZORPAY_KEY_ID ?? '',
  razorpayKeySecret: process.env.RAZORPAY_KEY_SECRET ?? '',
  razorpayWebhookSecret: process.env.RAZORPAY_WEBHOOK_SECRET ?? '',
});

export function getAccessTokenSecret() {
  const secret = process.env.JWT_ACCESS_SECRET;
  if (!secret || Buffer.byteLength(secret) < 32) {
    throw new Error('JWT_ACCESS_SECRET must be configured with at least 32 characters');
  }
  return secret;
}

export function getRazorpayConfig({ requireWebhookSecret = false } = {}) {
  if (env.razorpayMode !== 'test') throw new Error('This application only supports Razorpay Test Mode');
  if (!env.razorpayKeyId || !env.razorpayKeySecret) return null;
  if (!env.razorpayKeyId.startsWith('rzp_test_')) throw new Error('Only Razorpay test key IDs (rzp_test_...) are accepted');
  if (requireWebhookSecret && !env.razorpayWebhookSecret) return null;
  return { keyId: env.razorpayKeyId, keySecret: env.razorpayKeySecret, webhookSecret: env.razorpayWebhookSecret };
}

export function assertRazorpayTestMode() {
  if (env.razorpayMode !== 'test') throw new Error('RAZORPAY_MODE must be set to test');
  if (env.razorpayKeyId && !env.razorpayKeyId.startsWith('rzp_test_')) throw new Error('Live Razorpay credentials are not supported');
}
