import { Server } from 'socket.io';
import jwt from 'jsonwebtoken';
import mongoose from 'mongoose';
import { env, getAccessTokenSecret } from '../config/env.js';
import { User } from '../models/User.js';
import { ParkingLocation } from '../models/ParkingLocation.js';
import { authCookieNames } from '../modules/auth/auth.cookies.js';
import { setAvailabilitySocket } from './availability.js';

function readCookie(header, name) {
  for (const part of (header ?? '').split(';')) {
    const separator = part.indexOf('=');
    if (separator < 0) continue;
    if (part.slice(0, separator).trim() === name) return decodeURIComponent(part.slice(separator + 1).trim());
  }
  return null;
}

export function attachAvailabilitySocket(httpServer) {
  const io = new Server(httpServer, {
    path: '/api/v1/socket.io',
    cors: { origin: env.clientOrigin, credentials: true, methods: ['GET', 'POST'] },
  });
  setAvailabilitySocket(io);

  io.use(async (socket, next) => {
    try {
      const token = readCookie(socket.handshake.headers.cookie, authCookieNames.access);
      if (!token) return next();
      const claims = jwt.verify(token, getAccessTokenSecret(), { issuer: 'smart-parking-api', audience: 'smart-parking-client' });
      const user = await User.findById(claims.sub);
      if (!user || user.status !== 'active') return next(new Error('Authentication required'));
      socket.data.userId = user.id;
      socket.data.role = user.role;
      socket.data.tokenExpiresAt = claims.exp * 1000;
      return next();
    } catch { return next(new Error('Authentication required')); }
  });

  io.on('connection', (socket) => {
    let expiryTimer;
    if (Number.isFinite(socket.data.tokenExpiresAt)) {
      const remaining = Math.max(0, socket.data.tokenExpiresAt - Date.now());
      expiryTimer = setTimeout(() => socket.disconnect(true), remaining);
      expiryTimer.unref?.();
      socket.on('disconnect', () => clearTimeout(expiryTimer));
    }

    socket.on('availability:subscribe', async (payload, acknowledge = () => {}) => {
      try {
        if (!mongoose.isValidObjectId(payload?.locationId)) return acknowledge({ ok: false, error: 'Invalid location' });
        const location = await ParkingLocation.exists({ _id: payload.locationId, status: 'active' });
        if (!location) return acknowledge({ ok: false, error: 'Location not found' });
        socket.join(`location:${payload.locationId}`);
        return acknowledge({ ok: true });
      } catch { return acknowledge({ ok: false, error: 'Unable to subscribe' }); }
    });

    socket.on('availability:unsubscribe', (payload) => {
      if (mongoose.isValidObjectId(payload?.locationId)) socket.leave(`location:${payload.locationId}`);
    });
  });

  return io;
}
