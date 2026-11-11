const ACCESS_COOKIE = 'sp_access';
const REFRESH_COOKIE = 'sp_refresh';
const BASE_OPTIONS = Object.freeze({ httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: 'strict' });

export function setAuthCookies(res, accessToken, refreshToken) {
  res.cookie(ACCESS_COOKIE, accessToken, { ...BASE_OPTIONS, path: '/api/v1', maxAge: env.accessTokenTtlMs });
  res.cookie(REFRESH_COOKIE, refreshToken, { ...BASE_OPTIONS, path: '/api/v1/auth', maxAge: env.refreshTokenDays * 24 * 60 * 60 * 1000 });
}

export function clearAuthCookies(res) {
  res.clearCookie(ACCESS_COOKIE, { ...BASE_OPTIONS, path: '/api/v1' });
  res.clearCookie(REFRESH_COOKIE, { ...BASE_OPTIONS, path: '/api/v1/auth' });
}

export const authCookieNames = Object.freeze({ access: ACCESS_COOKIE, refresh: REFRESH_COOKIE });
import { env } from '../../config/env.js';

