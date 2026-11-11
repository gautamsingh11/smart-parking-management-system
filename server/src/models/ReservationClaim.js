import mongoose from 'mongoose';

const reservationClaimSchema = new mongoose.Schema({
  slotId: { type: mongoose.Schema.Types.ObjectId, ref: 'ParkingSlot', required: true },
  bookingId: { type: mongoose.Schema.Types.ObjectId, ref: 'Booking', required: true, index: true },
  minuteStart: { type: Date, required: true },
  active: { type: Boolean, default: true, required: true },
  expiresAt: { type: Date, required: true },
}, { timestamps: true });

reservationClaimSchema.index({ slotId: 1, minuteStart: 1 }, { unique: true, partialFilterExpression: { active: true } });
reservationClaimSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

export const ReservationClaim = mongoose.model('ReservationClaim', reservationClaimSchema);
