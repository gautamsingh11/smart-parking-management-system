import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';

const userSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true, minlength: 2, maxlength: 80 },
  email: { type: String, required: true, unique: true, lowercase: true, trim: true, maxlength: 254 },
  passwordHash: { type: String, required: true, select: false },
  phone: { type: String, trim: true, default: '', maxlength: 30 },
  role: { type: String, enum: ['customer', 'parking_owner', 'admin'], default: 'customer', immutable: true },
  status: { type: String, enum: ['active', 'disabled'], default: 'active' },
}, {
  timestamps: true,
  toJSON: {
    transform(_doc, result) {
      delete result.passwordHash;
      delete result.__v;
      return result;
    },
  },
});

userSchema.methods.setPassword = async function setPassword(password) {
  this.passwordHash = await bcrypt.hash(password, 12);
};

userSchema.methods.verifyPassword = function verifyPassword(password) {
  return bcrypt.compare(password, this.passwordHash);
};

export const User = mongoose.model('User', userSchema);
