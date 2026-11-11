import mongoose from 'mongoose';

const bookingSchema = new mongoose.Schema({
  customerId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  ownerId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  locationId: { type: mongoose.Schema.Types.ObjectId, ref: 'ParkingLocation', required: true, index: true },
  slotId: { type: mongoose.Schema.Types.ObjectId, ref: 'ParkingSlot', required: true, index: true },
  startAt: { type: Date, required: true, index: true },
  endAt: { type: Date, required: true },
  hourlyPricePaise: { type: Number, required: true, min: 1 },
  amountPaise: { type: Number, required: true, min: 1 },
  currency: { type: String, enum: ['INR'], default: 'INR' },
  status: { type: String, enum: ['confirmed', 'cancelled', 'completed'], default: 'confirmed', index: true },
  paymentStatus: { type: String, enum: ['pending', 'paid', 'failed', 'reconciliation_required'], default: 'pending', index: true },
  accessState: { type: String, enum: ['not_entered', 'entered', 'exited'], default: 'not_entered', index: true },
  entryAt: { type: Date, default: null },
  exitAt: { type: Date, default: null },
  accessHistory: [{
    eventId: { type: mongoose.Schema.Types.ObjectId, default: () => new mongoose.Types.ObjectId() },
    type: { type: String, enum: ['entry', 'exit'], required: true },
    verifiedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    credentialId: { type: mongoose.Schema.Types.ObjectId, ref: 'AccessCredential', required: true },
    at: { type: Date, required: true },
  }],
  cancelledAt: { type: Date, default: null },
  completedAt: { type: Date, default: null },
}, { timestamps: true });

bookingSchema.index({ customerId: 1, createdAt: -1 });
bookingSchema.index({ ownerId: 1, startAt: 1, status: 1 });

export const Booking = mongoose.model('Booking', bookingSchema);
