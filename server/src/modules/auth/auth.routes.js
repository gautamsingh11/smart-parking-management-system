import { Router } from 'express';
import { rateLimit } from 'express-rate-limit';
import { User } from '../../models/User.js';
import { AuthCredential } from '../../models/AuthCredential.js';
import { env, getAccessTokenSecret } from '../../config/env.js';
import { authenticate, requireRoles } from './auth.middleware.js';
import { authCookieNames, clearAuthCookies, setAuthCookies } from './auth.cookies.js';
import { consumePasswordResetToken, createAccessToken, createPasswordResetToken, createRefreshCredential, revokeRefreshToken, rotateRefreshToken, storePasswordResetToken } from './auth.tokens.js';
import { loginSchema, profileSchema, registerSchema, requestResetSchema, resetPasswordSchema } from './auth.validation.js';
import { passwordResetMailer as defaultMailer } from './passwordResetMailer.js';

const genericResetMessage = 'If an account exists for that email, password reset instructions will be sent.';
const authLimiter = rateLimit({ windowMs: 15 * 60 * 1000, limit: env.nodeEnv === 'test' ? 1000 : 10, standardHeaders: 'draft-8', legacyHeaders: false, message: { error: { code: 'RATE_LIMITED', message: 'Too many authentication attempts. Please try again later.' } } });
const resetLimiter = rateLimit({ windowMs: 15 * 60 * 1000, limit: env.nodeEnv === 'test' ? 1000 : 3, standardHeaders: 'draft-8', legacyHeaders: false, message: { error: { code: 'RATE_LIMITED', message: 'Too many password reset requests. Please try again later.' } } });
const refreshLimiter = rateLimit({ windowMs: 15 * 60 * 1000, limit: env.nodeEnv === 'test' ? 1000 : 60, standardHeaders: 'draft-8', legacyHeaders: false, message: { error: { code: 'RATE_LIMITED', message: 'Too many session refresh requests. Please try again later.' } } });

function validationFailure(res, parsed) {
  return res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: 'Please check the submitted fields', fields: parsed.error.flatten().fieldErrors } });
}

function requireTrustedOrigin(req, res, next) {
  const origin = req.get('origin');
  if (origin && origin !== env.clientOrigin) return res.status(403).json({ error: { code: 'UNTRUSTED_ORIGIN', message: 'Request origin is not allowed' } });
  return next();
}

function publicProfile(user) {
  return { id: user.id, name: user.name, email: user.email, phone: user.phone, role: user.role, createdAt: user.createdAt, updatedAt: user.updatedAt };
}

export function createAuthRouter({ passwordResetMailer = defaultMailer } = {}) {
  const router = Router();

  router.post('/register', authLimiter, requireTrustedOrigin, async (req, res, next) => {
    const parsed = registerSchema.safeParse(req.body);
    if (!parsed.success) return validationFailure(res, parsed);

    try {
      const { name, email, password, phone } = parsed.data;
      if (await User.exists({ email })) return res.status(409).json({ error: { code: 'EMAIL_ALREADY_REGISTERED', message: 'An account with this email already exists' } });

      const user = new User({ name, email, phone, role: 'customer' });
      await user.setPassword(password);
      await user.save();
      const accessToken = createAccessToken(user);
      const refreshToken = await createRefreshCredential(user.id);
      setAuthCookies(res, accessToken, refreshToken);
      return res.status(201).json({ user: publicProfile(user) });
    } catch (error) {
      if (error.code === 11000) return res.status(409).json({ error: { code: 'EMAIL_ALREADY_REGISTERED', message: 'An account with this email already exists' } });
      return next(error);
    }
  });

  router.post('/login', authLimiter, requireTrustedOrigin, async (req, res, next) => {
    const parsed = loginSchema.safeParse(req.body);
    if (!parsed.success) return validationFailure(res, parsed);
    try {
      const user = await User.findOne({ email: parsed.data.email }).select('+passwordHash');
      const valid = user && user.status === 'active' && await user.verifyPassword(parsed.data.password);
      if (!valid) return res.status(401).json({ error: { code: 'INVALID_CREDENTIALS', message: 'Email or password is incorrect' } });
      const accessToken = createAccessToken(user);
      const refreshToken = await createRefreshCredential(user.id);
      setAuthCookies(res, accessToken, refreshToken);
      return res.status(200).json({ user: publicProfile(user) });
    } catch (error) { return next(error); }
  });

  router.post('/refresh', refreshLimiter, requireTrustedOrigin, async (req, res, next) => {
    try {
      const token = req.cookies?.[authCookieNames.refresh];
      if (!token) return res.status(401).json({ error: { code: 'INVALID_REFRESH_TOKEN', message: 'Your session has expired. Please sign in again.' } });
      const userId = await rotateRefreshToken(token);
      const user = userId && await User.findById(userId);
      if (!user || user.status !== 'active') {
        clearAuthCookies(res);
        return res.status(401).json({ error: { code: 'INVALID_REFRESH_TOKEN', message: 'Your session has expired. Please sign in again.' } });
      }
      const refreshToken = await createRefreshCredential(user.id);
      setAuthCookies(res, createAccessToken(user), refreshToken);
      return res.json({ user: publicProfile(user) });
    } catch (error) { return next(error); }
  });

  router.post('/logout', requireTrustedOrigin, async (req, res, next) => {
    try {
      await revokeRefreshToken(req.cookies?.[authCookieNames.refresh]);
      clearAuthCookies(res);
      return res.status(204).end();
    } catch (error) { return next(error); }
  });

  router.get('/me', authenticate, (req, res) => res.json({ user: publicProfile(req.user) }));

  router.patch('/me', authenticate, async (req, res, next) => {
    const parsed = profileSchema.safeParse(req.body);
    if (!parsed.success) return validationFailure(res, parsed);
    try {
      Object.assign(req.user, parsed.data);
      await req.user.save();
      return res.json({ user: publicProfile(req.user) });
    } catch (error) { return next(error); }
  });

  router.post('/password/forgot', resetLimiter, async (req, res, next) => {
    const parsed = requestResetSchema.safeParse(req.body);
    if (!parsed.success) return validationFailure(res, parsed);
    if (!passwordResetMailer.configured && passwordResetMailer === defaultMailer) {
      return res.status(503).json({ error: { code: 'PASSWORD_RESET_UNAVAILABLE', message: 'Password reset is temporarily unavailable. Please try again later.' } });
    }
    try {
      const user = await User.findOne({ email: parsed.data.email, status: 'active' });
      if (user) {
        const resetToken = createPasswordResetToken();
        await storePasswordResetToken(user.id, resetToken);
        const resetUrl = new URL('/reset-password', env.clientOrigin);
        resetUrl.searchParams.set('token', resetToken);
        try { await passwordResetMailer.send(user.email, resetUrl.toString()); }
        catch { console.error('Password reset email delivery failed'); }
      }
      return res.status(202).json({ message: genericResetMessage });
    } catch (error) { return next(error); }
  });

  router.post('/password/reset', resetLimiter, async (req, res, next) => {
    const parsed = resetPasswordSchema.safeParse(req.body);
    if (!parsed.success) return validationFailure(res, parsed);
    try {
      const credential = await consumePasswordResetToken(parsed.data.token);
      if (!credential) return res.status(400).json({ error: { code: 'INVALID_OR_EXPIRED_RESET_TOKEN', message: 'This reset link is invalid or has expired. Request a new one.' } });
      const user = await User.findById(credential.userId);
      if (!user || user.status !== 'active') return res.status(400).json({ error: { code: 'INVALID_OR_EXPIRED_RESET_TOKEN', message: 'This reset link is invalid or has expired. Request a new one.' } });
      await user.setPassword(parsed.data.password);
      await user.save();
      await AuthCredential.updateMany({ userId: user.id, purpose: 'refresh', consumedAt: null }, { $set: { consumedAt: new Date() } });
      return res.json({ message: 'Your password has been reset. Please sign in with your new password.' });
    } catch (error) { return next(error); }
  });

  if (env.nodeEnv === 'test') {
    router.get('/test/owner-access', authenticate, requireRoles('parking_owner', 'admin'), (_req, res) => res.json({ allowed: true }));
    router.get('/test/admin-access', authenticate, requireRoles('admin'), (_req, res) => res.json({ allowed: true }));
  }

  return router;
}
