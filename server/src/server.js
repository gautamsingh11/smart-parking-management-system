import { createServer } from 'node:http';
import { app } from './app.js';
import { connectDatabase } from './config/database.js';
import { assertRazorpayTestMode, env, getAccessTokenSecret } from './config/env.js';
import { attachAvailabilitySocket } from './realtime/availability.socket.js';

try {
  getAccessTokenSecret();
  assertRazorpayTestMode();
  await connectDatabase();
  const server = createServer(app);
  const io = attachAvailabilitySocket(server);
  server.listen(env.port, () => {
    console.info(`Smart Parking API listening on port ${env.port}`);
  });

  async function shutdown(signal) {
    console.info(`${signal} received; shutting down`);
    io.close(async () => {
      const { default: mongoose } = await import('mongoose');
      await mongoose.disconnect();
      process.exit(0);
    });
  }

  process.once('SIGINT', () => shutdown('SIGINT'));
  process.once('SIGTERM', () => shutdown('SIGTERM'));
} catch (error) {
  console.error('Unable to start Smart Parking API:', error.message);
  process.exit(1);
}
