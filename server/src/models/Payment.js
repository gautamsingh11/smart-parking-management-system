import mongoose from 'mongoose';

const paymentSchema = new mongoose.Schema({
  bookingId: { type: mongoose.Schema.Types.ObjectId, ref: 'Booking', required: true, index: true },
  customerId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  attempt: { type: Number, required: true, min: 1 },
  provider: { type: String, enum: ['razorpay'], default: 'razorpay' },
  providerOrderId: { type: String, default: undefined },
  providerPaymentId: { type: String, default: undefined },
  receipt: { type: String, required: true },
  amountPaise: { type: Number, required: true, min: 1 },
  currency: { type: String, enum: ['INR'], default: 'INR' },
  status: { type: String, enum: ['creating', 'created', 'authorized', 'captured', 'failed', 'cancelled', 'reconciliation_required'], default: 'creating', index: true },
  failureCode: { type: String, default: null, maxlength: 100 },
  failureDescription: { type: String, default: null, maxlength: 300 },
  createdAtProvider: { type: Date, default: null },
  capturedAt: { type: Date, default: null },
  failedAt: { type: Date, default: null },
}, { timestamps: true });

paymentSchema.index({ bookingId: 1, attempt: 1 }, { unique: true });
paymentSchema.index({ providerOrderId: 1 }, { unique: true, sparse: true });
paymentSchema.index({ providerPaymentId: 1 }, { unique: true, sparse: true });
paymentSchema.index({ customerId: 1, createdAt: -1 });

export const Payment = mongoose.model('Payment', paymentSchema);
