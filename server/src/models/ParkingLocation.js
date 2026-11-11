import mongoose from 'mongoose';

const addressSchema = new mongoose.Schema({
  line1: { type: String, required: true, trim: true, maxlength: 160 },
  line2: { type: String, trim: true, default: '', maxlength: 160 },
  city: { type: String, required: true, trim: true, maxlength: 100 },
  state: { type: String, required: true, trim: true, maxlength: 100 },
  postalCode: { type: String, required: true, trim: true, maxlength: 20 },
  country: { type: String, required: true, trim: true, maxlength: 80 },
}, { _id: false });

const hoursSchema = new mongoose.Schema({
  day: { type: Number, required: true, min: 0, max: 6 },
  closed: { type: Boolean, default: false },
  openAt: { type: String, required: true, match: /^(?:[01]\d|2[0-3]):[0-5]\d$/ },
  closeAt: { type: String, required: true, match: /^(?:(?:[01]\d|2[0-3]):[0-5]\d|24:00)$/ },
}, { _id: false });

const parkingLocationSchema = new mongoose.Schema({
  ownerId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  name: { type: String, required: true, trim: true, maxlength: 120 },
  description: { type: String, trim: true, default: '', maxlength: 1500 },
  address: { type: addressSchema, required: true },
  point: {
    type: { type: String, enum: ['Point'], default: 'Point', required: true },
    coordinates: { type: [Number], required: true }, // GeoJSON order is longitude, latitude.
  },
  timezone: { type: String, required: true, default: 'Asia/Kolkata' },
  operatingHours: { type: [hoursSchema], required: true },
  status: { type: String, enum: ['active', 'inactive', 'archived'], default: 'active', index: true },
}, { timestamps: true });

parkingLocationSchema.index({ point: '2dsphere' });
parkingLocationSchema.index({ 'address.city': 1, status: 1 });

export const ParkingLocation = mongoose.model('ParkingLocation', parkingLocationSchema);
