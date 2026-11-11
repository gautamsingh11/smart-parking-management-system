import mongoose from 'mongoose';

const accessCredentialSchema = new mongoose.Schema({
  bookingId: { type: mongoose.Schema.Types.ObjectId, ref: 'Booking', required: true },
  customerId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  tokenHash: { type: String, default: undefined, select: false },
  purpose: { type: String, enum: ['entry', 'exit', 'completed', 'revoked'], required: true },
  expiresAt: { type: Date, required: true, index: true },
  consumedAt: { type: Date, default: null },
  issuedAt: { type: Date, required: true },
  lastIssuedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  revokedAt: { type: Date, default: null },
}, { timestamps: true });

accessCredentialSchema.index({ tokenHash: 1 }, { unique: true, sparse: true });
accessCredentialSchema.index({ bookingId: 1 });
accessCredentialSchema.index({ bookingId: 1 }, { unique: true, name: 'one_active_credential_per_booking', partialFilterExpression: { purpose: { $in: ['entry', 'exit'] } } });

export const AccessCredential = mongoose.model('AccessCredential', accessCredentialSchema);
