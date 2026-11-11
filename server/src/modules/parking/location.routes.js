import { Router } from 'express';
import { authenticate, requireRoles } from '../auth/auth.middleware.js';
import { User } from '../../models/User.js';
import { ParkingLocation } from '../../models/ParkingLocation.js';
import { ParkingSlot } from '../../models/ParkingSlot.js';
import { Booking } from '../../models/Booking.js';
import { availabilityQuerySchema, locationCreateSchema, locationUpdateSchema, searchQuerySchema, slotAvailabilityQuerySchema } from './parking.validation.js';
import { availabilityWindow, getManagedLocation, isValidId, isWithinOperatingHours, locationView, slotView, availableSlotIds } from './parking.service.js';
import { publishAvailability } from '../../realtime/availability.js';

export const locationRouter = Router();
export const ownerLocationRouter = Router();

function invalid(res, parsed) {
  return res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: 'Please check the submitted fields', fields: parsed.error.flatten().fieldErrors } });
}
function escapeRegex(value) { return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }
function validTimezone(timezone) {
  try { new Intl.DateTimeFormat('en-US', { timeZone: timezone }); return true; } catch { return false; }
}
function geoFilter(filter, latitude, longitude, radiusKm) {
  if (latitude !== undefined && longitude !== undefined) {
    filter.point = { $geoWithin: { $centerSphere: [[longitude, latitude], radiusKm / 6378.1] } };
  }
}

ownerLocationRouter.get('/', authenticate, requireRoles('parking_owner', 'admin'), async (req, res, next) => {
  try {
    const filter = req.user.role === 'admin' ? {} : { ownerId: req.user.id };
    const locations = await ParkingLocation.find(filter).sort({ createdAt: -1 });
    const locationIds = locations.map((location) => location._id);
    const [slots, upcomingBookings] = await Promise.all([
      ParkingSlot.find({ locationId: { $in: locationIds } }),
      Booking.countDocuments({ locationId: { $in: locationIds }, status: 'confirmed', endAt: { $gt: new Date() } }),
    ]);
    const slotsByLocation = new Map();
    for (const slot of slots) {
      const locationSlots = slotsByLocation.get(String(slot.locationId)) ?? [];
      locationSlots.push(slotView(slot));
      slotsByLocation.set(String(slot.locationId), locationSlots);
    }
    return res.json({ locations: locations.map((location) => {
      const locationSlots = slotsByLocation.get(String(location._id)) ?? [];
      return { ...locationView(location), slotCount: locationSlots.length, slots: locationSlots };
    }), upcomingBookings });
  } catch (error) { return next(error); }
});

locationRouter.post('/', authenticate, requireRoles('parking_owner', 'admin'), async (req, res, next) => {
  const parsed = locationCreateSchema.safeParse(req.body);
  if (!parsed.success) return invalid(res, parsed);
  if (req.user.role !== 'admin' && parsed.data.ownerId) return res.status(400).json({ error: { code: 'INVALID_OWNER', message: 'Only administrators can assign a location owner' } });
  if (!validTimezone(parsed.data.timezone)) return res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: 'Timezone must be a valid IANA timezone' } });
  try {
    let ownerId = req.user.id;
    if (req.user.role === 'admin' && parsed.data.ownerId) {
      const owner = await User.findOne({ _id: parsed.data.ownerId, status: 'active', role: { $in: ['parking_owner', 'admin'] } });
      if (!owner) return res.status(400).json({ error: { code: 'INVALID_OWNER', message: 'Select an active parking owner or administrator' } });
      ownerId = owner.id;
    }
    const { coordinates, ownerId: _ignoredOwnerId, ...locationData } = parsed.data;
    const location = await ParkingLocation.create({ ...locationData, ownerId, point: { type: 'Point', coordinates: [coordinates.longitude, coordinates.latitude] } });
    return res.status(201).json({ location: locationView(location) });
  } catch (error) { return next(error); }
});

locationRouter.get('/', async (req, res, next) => {
  const parsed = searchQuerySchema.safeParse(req.query);
  if (!parsed.success) return invalid(res, parsed);
  try {
    const query = parsed.data;
    const filter = { status: 'active' };
    if (query.city) filter['address.city'] = new RegExp(escapeRegex(query.city), 'i');
    if (query.q) {
      const matcher = new RegExp(escapeRegex(query.q), 'i');
      filter.$or = [{ name: matcher }, { description: matcher }, { 'address.city': matcher }, { 'address.state': matcher }, { 'address.postalCode': matcher }];
    }
    geoFilter(filter, query.latitude, query.longitude, query.radiusKm);
    const window = availabilityWindow(query);
    const [locations, total] = await Promise.all([
      ParkingLocation.find(filter).sort(query.latitude !== undefined ? {} : { createdAt: -1 }).skip((query.page - 1) * query.limit).limit(query.limit),
      ParkingLocation.countDocuments(filter),
    ]);
    const locationIds = locations.map((location) => location._id);
    const slotFilter = { locationId: { $in: locationIds }, status: 'active' };
    if (query.vehicleType) slotFilter.vehicleType = query.vehicleType;
    if (query.maxHourlyPricePaise !== undefined) slotFilter.hourlyPricePaise = { $lte: query.maxHourlyPricePaise };
    const slots = await ParkingSlot.find(slotFilter).sort({ hourlyPricePaise: 1 });
    const availability = await availableSlotIds(slots, window.startAt, window.endAt);
    const slotsByLocation = new Map();
    for (const slot of slots) {
      const values = slotsByLocation.get(String(slot.locationId)) ?? [];
      values.push(slot);
      slotsByLocation.set(String(slot.locationId), values);
    }
    const results = locations.map((location) => {
      const locationSlots = slotsByLocation.get(String(location._id)) ?? [];
      const open = isWithinOperatingHours(location, window.startAt, window.endAt);
      const availableSlots = open ? locationSlots.filter((slot) => availability.has(String(slot._id))).length : 0;
      const prices = locationSlots.map((slot) => slot.hourlyPricePaise);
      return {
        ...locationView(location),
        totalSlots: locationSlots.length,
        availableSlots,
        minHourlyPricePaise: prices.length ? Math.min(...prices) : null,
      };
    });
    return res.json({ locations: results, page: query.page, limit: query.limit, total, startAt: window.startAt, endAt: window.endAt });
  } catch (error) { return next(error); }
});

locationRouter.get('/:locationId/availability', async (req, res, next) => {
  if (!isValidId(req.params.locationId)) return res.status(404).json({ error: { code: 'LOCATION_NOT_FOUND', message: 'Parking location not found' } });
  const parsed = availabilityQuerySchema.safeParse(req.query);
  if (!parsed.success) return invalid(res, parsed);
  try {
    const location = await ParkingLocation.findOne({ _id: req.params.locationId, status: 'active' });
    if (!location) return res.status(404).json({ error: { code: 'LOCATION_NOT_FOUND', message: 'Parking location not found' } });
    const window = availabilityWindow(parsed.data);
    const slots = await ParkingSlot.find({ locationId: location.id, status: { $in: ['active', 'maintenance'] } }).sort({ slotNumber: 1 });
    const available = await availableSlotIds(slots, window.startAt, window.endAt);
    const withinHours = isWithinOperatingHours(location, window.startAt, window.endAt);
    const slotResults = slots.map((slot) => ({ id: slot.id, slotNumber: slot.slotNumber, vehicleType: slot.vehicleType, hourlyPricePaise: slot.hourlyPricePaise, status: slot.status, available: withinHours && available.has(String(slot._id)) }));
    return res.json({ location: locationView(location), startAt: window.startAt, endAt: window.endAt, slots: slotResults, availableCount: slotResults.filter((slot) => slot.available).length });
  } catch (error) { return next(error); }
});

locationRouter.get('/:locationId/slots', async (req, res, next) => {
  if (!isValidId(req.params.locationId)) return res.status(404).json({ error: { code: 'LOCATION_NOT_FOUND', message: 'Parking location not found' } });
  const parsed = slotAvailabilityQuerySchema.safeParse(req.query);
  if (!parsed.success) return invalid(res, parsed);
  try {
    const location = await ParkingLocation.findOne({ _id: req.params.locationId, status: 'active' });
    if (!location) return res.status(404).json({ error: { code: 'LOCATION_NOT_FOUND', message: 'Parking location not found' } });
    const window = availabilityWindow(parsed.data);
    const slots = await ParkingSlot.find({ locationId: location.id, status: { $in: ['active', 'maintenance'] }, ...(parsed.data.vehicleType ? { vehicleType: parsed.data.vehicleType } : {}) }).sort({ slotNumber: 1 });
    const available = await availableSlotIds(slots, window.startAt, window.endAt);
    const withinHours = isWithinOperatingHours(location, window.startAt, window.endAt);
    return res.json({ slots: slots.map((slot) => ({ id: slot.id, slotNumber: slot.slotNumber, vehicleType: slot.vehicleType, hourlyPricePaise: slot.hourlyPricePaise, status: slot.status, available: withinHours && available.has(String(slot._id)) })), startAt: window.startAt, endAt: window.endAt });
  } catch (error) { return next(error); }
});

locationRouter.get('/:locationId', async (req, res, next) => {
  if (!isValidId(req.params.locationId)) return res.status(404).json({ error: { code: 'LOCATION_NOT_FOUND', message: 'Parking location not found' } });
  try {
    const location = await ParkingLocation.findOne({ _id: req.params.locationId, status: 'active' });
    if (!location) return res.status(404).json({ error: { code: 'LOCATION_NOT_FOUND', message: 'Parking location not found' } });
    return res.json({ location: locationView(location) });
  } catch (error) { return next(error); }
});

locationRouter.patch('/:locationId', authenticate, requireRoles('parking_owner', 'admin'), async (req, res, next) => {
  const parsed = locationUpdateSchema.safeParse(req.body);
  if (!parsed.success) return invalid(res, parsed);
  if (parsed.data.timezone && !validTimezone(parsed.data.timezone)) return res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: 'Timezone must be a valid IANA timezone' } });
  try {
    const location = await getManagedLocation(req.params.locationId, req.user);
    if (!location) return res.status(404).json({ error: { code: 'LOCATION_NOT_FOUND', message: 'Parking location not found' } });
    const { coordinates, ...fields } = parsed.data;
    Object.assign(location, fields);
    if (coordinates) location.point = { type: 'Point', coordinates: [coordinates.longitude, coordinates.latitude] };
    await location.save();
    publishAvailability(location.id, { locationStatus: location.status });
    return res.json({ location: locationView(location) });
  } catch (error) { return next(error); }
});

locationRouter.delete('/:locationId', authenticate, requireRoles('parking_owner', 'admin'), async (req, res, next) => {
  try {
    const location = await getManagedLocation(req.params.locationId, req.user);
    if (!location) return res.status(404).json({ error: { code: 'LOCATION_NOT_FOUND', message: 'Parking location not found' } });
    location.status = 'archived';
    await location.save();
    publishAvailability(location.id, { locationStatus: location.status });
    return res.status(204).end();
  } catch (error) { return next(error); }
});
