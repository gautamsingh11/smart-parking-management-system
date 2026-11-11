import mongoose from 'mongoose';

const authCredentialSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  purpose: { type: String, enum: ['refresh', 'password_reset'], required: true, index: true },
  tokenHash: { type: String, required: true, unique: true, select: false },
  expiresAt: { type: Date, required: true },
  consumedAt: { type: Date, default: null },
}, { timestamps: true });

authCredentialSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

export const AuthCredential = mongoose.model('AuthCredential', authCredentialSchema);
