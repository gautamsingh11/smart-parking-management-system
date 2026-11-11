import { createHash, randomBytes } from 'node:crypto';
import jwt from 'jsonwebtoken';
import { env, getAccessTokenSecret } from '../../config/env.js';
import { AuthCredential } from '../../models/AuthCredential.js';

const hashToken = (token) => createHash('sha256').update(token).digest('hex');

export function createAccessToken(user) {
  return jwt.sign({ sub: user.id, role: user.role }, getAccessTokenSecret(), { expiresIn: env.accessTokenTtl, issuer: 'smart-parking-api', audience: 'smart-parking-client' });
}

export async function createRefreshCredential(userId) {
  const rawToken = randomBytes(48).toString('base64url');
  const expiresAt = new Date(Date.now() + env.refreshTokenDays * 24 * 60 * 60 * 1000);
  await AuthCredential.create({ userId, purpose: 'refresh', tokenHash: hashToken(rawToken), expiresAt });
  return rawToken;
}

export function createPasswordResetToken() {
  return randomBytes(32).toString('base64url');
}

export async function storePasswordResetToken(userId, rawToken) {
  await AuthCredential.updateMany({ userId, purpose: 'password_reset', consumedAt: null }, { $set: { consumedAt: new Date() } });
  const expiresAt = new Date(Date.now() + env.passwordResetMinutes * 60 * 1000);
  await AuthCredential.create({ userId, purpose: 'password_reset', tokenHash: hashToken(rawToken), expiresAt });
}

export async function consumePasswordResetToken(rawToken) {
  return AuthCredential.findOneAndUpdate({ purpose: 'password_reset', tokenHash: hashToken(rawToken), consumedAt: null, expiresAt: { $gt: new Date() } }, { $set: { consumedAt: new Date() } }, { new: true }).select('+tokenHash');
}

export async function rotateRefreshToken(rawToken) {
  const now = new Date();
  const oldCredential = await AuthCredential.findOneAndUpdate({ purpose: 'refresh', tokenHash: hashToken(rawToken), consumedAt: null, expiresAt: { $gt: now } }, { $set: { consumedAt: now } }, { new: true });
  return oldCredential?.userId ?? null;
}

export async function revokeRefreshToken(rawToken) {
  if (!rawToken) return;
  await AuthCredential.updateOne({ purpose: 'refresh', tokenHash: hashToken(rawToken), consumedAt: null }, { $set: { consumedAt: new Date() } });
}

export { hashToken };
