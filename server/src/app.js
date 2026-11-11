import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import { env } from './config/env.js';
import { healthRouter } from './routes/health.js';
import { createAuthRouter } from './modules/auth/auth.routes.js';
import { locationRouter, ownerLocationRouter } from './modules/parking/location.routes.js';
import { slotRouter } from './modules/parking/slot.routes.js';
import { bookingRouter, ownerBookingRouter } from './modules/parking/booking.routes.js';
import { notFoundHandler } from './middleware/notFound.js';
import { errorHandler } from './middleware/errorHandler.js';
import { paymentWebhookRouter } from './modules/payments/payment.webhook.routes.js';
import { createPaymentRouter } from './modules/payments/payment.routes.js';
import { accessRouter } from './modules/access/access.routes.js';

export function createApp({ passwordResetMailer, razorpayClient } = {}) {
  const app = express();

  app.disable('x-powered-by');
  app.use(helmet({ contentSecurityPolicy: { directives: {
    ...helmet.contentSecurityPolicy.getDefaultDirectives(),
    'script-src': ["'self'", "'unsafe-inline'", 'https://checkout.razorpay.com'],
    'frame-src': ["'self'", 'https://checkout.razorpay.com', 'https://api.razorpay.com', 'https://*.razorpay.com'],
    'connect-src': ["'self'", 'https://api.razorpay.com', 'https://*.razorpay.com'],
    'img-src': ["'self'", 'data:', 'blob:', 'https:'],
    'style-src': ["'self'", "'unsafe-inline'", 'https:'],
  } } }));
  app.use(cors({ origin: env.clientOrigin, credentials: true, methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'], optionsSuccessStatus: 204 }));
  app.use('/api/v1/payments/webhook', paymentWebhookRouter);
  app.use(express.json({ limit: '100kb' }));
  app.use(cookieParser());
  app.use('/api/health', healthRouter);
  app.use('/api/v1/auth', createAuthRouter({ passwordResetMailer }));
  app.use('/api/v1/locations', slotRouter);
  app.use('/api/v1/locations', locationRouter);
  app.use('/api/v1/owner/locations', ownerLocationRouter);
  app.use('/api/v1/bookings', bookingRouter);
  app.use('/api/v1/owner/bookings', ownerBookingRouter);
  app.use('/api/v1/payments', createPaymentRouter({ razorpayClient }));
  app.use('/api/v1/bookings', accessRouter);
  app.use(notFoundHandler);
  app.use(errorHandler);
  return app;
}

export const app = createApp();
