import mongoose from 'mongoose';

const paymentWebhookEventSchema = new mongoose.Schema({
  eventId: { type: String, required: true, unique: true, maxlength: 160 },
  eventType: { type: String, required: true, maxlength: 120 },
  providerOrderId: { type: String, default: null },
  providerPaymentId: { type: String, default: null },
  status: { type: String, enum: ['processing', 'processed', 'ignored', 'failed'], default: 'processing', index: true },
  receivedAt: { type: Date, default: Date.now },
  processedAt: { type: Date, default: null },
  failureCode: { type: String, default: null, maxlength: 100 },
}, { timestamps: true });

export const PaymentWebhookEvent = mongoose.model('PaymentWebhookEvent', paymentWebhookEventSchema);
