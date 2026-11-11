import { Router } from 'express';
import mongoose from 'mongoose';

export const healthRouter = Router();

healthRouter.get('/', (req, res) => {
  const databaseConnected = mongoose.connection.readyState === 1;
  res.status(databaseConnected ? 200 : 503).json({
    status: databaseConnected ? 'ok' : 'degraded',
    service: 'smart-parking-api',
    timestamp: new Date().toISOString(),
    dependencies: { database: databaseConnected ? 'connected' : 'disconnected' },
  });
});
