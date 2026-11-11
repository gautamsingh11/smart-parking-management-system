import mongoose from 'mongoose';
import { env } from './env.js';
import { User } from '../models/User.js';
import { AuthCredential } from '../models/AuthCredential.js';
import { ParkingLocation } from '../models/ParkingLocation.js';
import { ParkingSlot } from '../models/ParkingSlot.js';
import { Booking } from '../models/Booking.js';
import { ReservationClaim } from '../models/ReservationClaim.js';
import { AccessCredential } from '../models/AccessCredential.js';
import { Payment } from '../models/Payment.js';
import { PaymentWebhookEvent } from '../models/PaymentWebhookEvent.js';

export async function connectDatabase() {
  await mongoose.connect(env.mongoUri, { serverSelectionTimeoutMS: 5000 });
  await Promise.all([
    User.init(),
    AuthCredential.init(),
    ParkingLocation.init(),
    ParkingSlot.init(),
    Booking.init(),
    ReservationClaim.init(),
    AccessCredential.init(),
    Payment.init(),
    PaymentWebhookEvent.init(),
  ]);
  return mongoose.connection;
}
