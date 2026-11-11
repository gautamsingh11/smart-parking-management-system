import jwt from 'jsonwebtoken';
import { User } from '../../models/User.js';
import { getAccessTokenSecret } from '../../config/env.js';
import { authCookieNames } from './auth.cookies.js';

export async function authenticate(req, res, next) {
  try {
    const token = req.cookies?.[authCookieNames.access];
    if (!token) return res.status(401).json({ error: { code: 'AUTHENTICATION_REQUIRED', message: 'Please sign in to continue' } });

    const claims = jwt.verify(token, getAccessTokenSecret(), { issuer: 'smart-parking-api', audience: 'smart-parking-client' });
    const user = await User.findById(claims.sub);
    if (!user || user.status !== 'active') {
      return res.status(401).json({ error: { code: 'AUTHENTICATION_REQUIRED', message: 'Your session is no longer valid' } });
    }

    req.user = user;
    return next();
  } catch (error) {
    if (error.name === 'JsonWebTokenError' || error.name === 'TokenExpiredError') {
      return res.status(401).json({ error: { code: 'INVALID_ACCESS_TOKEN', message: 'Your session has expired or is invalid' } });
    }
    return next(error);
  }
}

export function requireRoles(...roles) {
  return (req, res, next) => {
    if (!req.user) return res.status(401).json({ error: { code: 'AUTHENTICATION_REQUIRED', message: 'Please sign in to continue' } });
    if (!roles.includes(req.user.role)) return res.status(403).json({ error: { code: 'FORBIDDEN', message: 'You do not have permission to access this resource' } });
    return next();
  };
}
