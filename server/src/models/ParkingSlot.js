import mongoose from 'mongoose';

const parkingSlotSchema = new mongoose.Schema({
  locationId: { type: mongoose.Schema.Types.ObjectId, ref: 'ParkingLocation', required: true, index: true },
  slotNumber: { type: String, required: true, trim: true, uppercase: true, maxlength: 24 },
  vehicleType: { type: String, enum: ['car', 'motorcycle', 'electric_vehicle'], required: true, index: true },
  hourlyPricePaise: { type: Number, required: true, min: 1, max: 100_000_000 },
  status: { type: String, enum: ['active', 'maintenance', 'inactive'], default: 'active', index: true },
}, { timestamps: true });

parkingSlotSchema.index({ locationId: 1, slotNumber: 1 }, { unique: true });
parkingSlotSchema.index({ locationId: 1, vehicleType: 1, status: 1, hourlyPricePaise: 1 });

export const ParkingSlot = mongoose.model('ParkingSlot', parkingSlotSchema);
