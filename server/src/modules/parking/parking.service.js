import mongoose from 'mongoose';
import { ParkingLocation } from '../../models/ParkingLocation.js';
import { ParkingSlot } from '../../models/ParkingSlot.js';
import { ReservationClaim } from '../../models/ReservationClaim.js';
import { Booking } from '../../models/Booking.js';

export const isValidId = (value) => mongoose.isValidObjectId(value);

export function locationView(location) {
  return {
    id: location.id,
    ownerId: String(location.ownerId),
    name: location.name,
    description: location.description,
    address: location.address,
    coordinates: { longitude: location.point.coordinates[0], latitude: location.point.coordinates[1] },
    timezone: location.timezone,
    operatingHours: location.operatingHours,
    status: location.status,
    createdAt: location.createdAt,
    updatedAt: location.updatedAt,
  };
}

export function slotView(slot, available = undefined) {
  return {
    id: slot.id,
    locationId: String(slot.locationId),
    slotNumber: slot.slotNumber,
    vehicleType: slot.vehicleType,
    hourlyPricePaise: slot.hourlyPricePaise,
    status: slot.status,
    ...(available === undefined ? {} : { available }),
  };
}

export function assertMinuteAligned(startAt, endAt) {
  if (startAt.getSeconds() || startAt.getMilliseconds() || endAt.getSeconds() || endAt.getMilliseconds()) {
    const error = new Error('Reservation times must use whole-minute increments');
    error.status = 400;
    error.code = 'INVALID_RESERVATION_TIME';
    throw error;
  }
  const durationMinutes = (endAt.getTime() - startAt.getTime()) / 60_000;
  if (durationMinutes < 1 || durationMinutes > 24 * 60) {
    const error = new Error('A reservation must be between 1 minute and 24 hours');
    error.status = 400;
    error.code = 'INVALID_RESERVATION_DURATION';
    throw error;
  }
}

export function availabilityWindow(query = {}, now = new Date()) {
  if (query.startAt && query.endAt) {
    assertMinuteAligned(query.startAt, query.endAt);
    if (query.endAt <= query.startAt) {
      const error = new Error('endAt must be later than startAt');
      error.status = 400;
      error.code = 'INVALID_RESERVATION_TIME';
      throw error;
    }
    return { startAt: query.startAt, endAt: query.endAt };
  }
  const startAt = new Date(Math.ceil(now.getTime() / 60_000) * 60_000);
  return { startAt, endAt: new Date(startAt.getTime() + 60 * 60_000) };
}

export async function availableSlotIds(slots, startAt, endAt) {
  if (!slots.length) return new Set();
  const claims = await ReservationClaim.distinct('slotId', {
    slotId: { $in: slots.map((slot) => slot._id) },
    minuteStart: { $gte: startAt, $lt: endAt },
    active: true,
  });
  const busy = new Set(claims.map(String));
  return new Set(slots.filter((slot) => slot.status === 'active' && !busy.has(String(slot._id))).map((slot) => String(slot._id)));
}

export async function getManagedLocation(locationId, user) {
  if (!isValidId(locationId)) return null;
  const location = await ParkingLocation.findById(locationId);
  if (!location) return null;
  if (user.role !== 'admin' && String(location.ownerId) !== String(user.id)) {
    const error = new Error('You do not have permission to manage this parking location');
    error.status = 403;
    error.code = 'FORBIDDEN';
    throw error;
  }
  return location;
}

const weekdayIndex = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
function localParts(value, timezone) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit', weekday: 'short',
    hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
  }).formatToParts(value);
  return Object.fromEntries(parts.map(({ type, value: part }) => [type, part]));
}
function localDateKey(parts) { return `${parts.year}-${parts.month}-${parts.day}`; }
function nextLocalDateKey(parts) {
  const nextDate = new Date(Date.UTC(Number(parts.year), Number(parts.month) - 1, Number(parts.day) + 1));
  return `${nextDate.getUTCFullYear()}-${String(nextDate.getUTCMonth() + 1).padStart(2, '0')}-${String(nextDate.getUTCDate()).padStart(2, '0')}`;
}
function minutesOfDay(parts) { return Number(parts.hour) * 60 + Number(parts.minute); }
function asMinutes(value) {
  if (value === '24:00') return 1440;
  const [hours, minutes] = value.split(':').map(Number);
  return hours * 60 + minutes;
}

export function isWithinOperatingHours(location, startAt, endAt) {
  const start = localParts(startAt, location.timezone);
  const end = localParts(endAt, location.timezone);
  const day = location.operatingHours.find((hours) => hours.day === weekdayIndex[start.weekday]);
  if (!day || day.closed) return false;
  const openAt = asMinutes(day.openAt);
  const closeAt = asMinutes(day.closeAt);
  const endIsCloseAtMidnight = closeAt === 1440 && localDateKey(end) === nextLocalDateKey(start) && minutesOfDay(end) === 0;
  const sameBusinessDay = localDateKey(end) === localDateKey(start) || endIsCloseAtMidnight;
  return sameBusinessDay && minutesOfDay(start) >= openAt && (endIsCloseAtMidnight || minutesOfDay(end) <= closeAt);
}

export async function ensureNoFutureBookingsForSlot(slotId, now = new Date()) {
  return Booking.exists({ slotId, status: 'confirmed', endAt: { $gt: now } });
}

export async function slotAvailabilityForLocation(locationId, startAt, endAt, vehicleType) {
  const filter = { locationId, status: { $in: ['active', 'maintenance'] } };
  if (vehicleType) filter.vehicleType = vehicleType;
  const slots = await ParkingSlot.find(filter).sort({ slotNumber: 1 });
  const available = await availableSlotIds(slots, startAt, endAt);
  return slots.map((slot) => slotView(slot, available.has(String(slot._id))));
}
