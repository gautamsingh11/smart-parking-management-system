import { Router } from 'express';
import { rateLimit } from 'express-rate-limit';
import { authenticate, requireRoles } from '../auth/auth.middleware.js';
import { Booking } from '../../models/Booking.js';
import { ParkingLocation } from '../../models/ParkingLocation.js';
import { ParkingSlot } from '../../models/ParkingSlot.js';
import { ReservationClaim } from '../../models/ReservationClaim.js';
import { env } from '../../config/env.js';
import { bookingCreateSchema } from './parking.validation.js';
import { assertMinuteAligned, isValidId, isWithinOperatingHours, locationView, slotView } from './parking.service.js';
import { publishAvailability } from '../../realtime/availability.js';

export const bookingRouter = Router();
export const ownerBookingRouter = Router();

const bookingLimiter = rateLimit({ windowMs: 60 * 1000, limit: env.nodeEnv === 'test' ? 1000 : 30, standardHeaders: 'draft-8', legacyHeaders: false, message: { error: { code: 'RATE_LIMITED', message: 'Too many booking requests. Please try again shortly.' } } });
const minuteMs = 60_000;

function invalid(res, parsed) {
  return res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: 'Please check the submitted fields', fields: parsed.error.flatten().fieldErrors } });
}

function bookingView(booking) {
  const view = {
    id: booking.id,
    customerId: String(booking.customerId?._id ?? booking.customerId),
    ownerId: String(booking.ownerId),
    locationId: String(booking.locationId?._id ?? booking.locationId),
    slotId: String(booking.slotId?._id ?? booking.slotId),
    startAt: booking.startAt,
    endAt: booking.endAt,
    hourlyPricePaise: booking.hourlyPricePaise,
    amountPaise: booking.amountPaise,
    currency: booking.currency,
    status: booking.status,
    paymentStatus: booking.paymentStatus,
    accessState: booking.accessState,
    entryAt: booking.entryAt,
    exitAt: booking.exitAt,
    cancelledAt: booking.cancelledAt,
    completedAt: booking.completedAt,
    createdAt: booking.createdAt,
    updatedAt: booking.updatedAt,
  };
  if (booking.locationId?.name) view.location = locationView(booking.locationId);
  if (booking.slotId?.slotNumber) view.slot = slotView(booking.slotId);
  if (booking.customerId?.name) view.customer = { id: String(booking.customerId._id), name: booking.customerId.name, email: booking.customerId.email };
  return view;
}

function bookingMinuteClaims(booking, slotId) {
  const minuteCount = (booking.endAt.getTime() - booking.startAt.getTime()) / minuteMs;
  const expiresAt = new Date(booking.endAt.getTime() + 24 * 60 * 60 * 1000);
  return Array.from({ length: minuteCount }, (_, index) => ({
    slotId,
    bookingId: booking._id,
    minuteStart: new Date(booking.startAt.getTime() + index * minuteMs),
    active: true,
    expiresAt,
  }));
}

bookingRouter.post('/', authenticate, requireRoles('customer'), bookingLimiter, async (req, res, next) => {
  const parsed = bookingCreateSchema.safeParse(req.body);
  if (!parsed.success) return invalid(res, parsed);
  const { locationId, slotId, startAt, endAt } = parsed.data;
  try {
    assertMinuteAligned(startAt, endAt);
    if (startAt <= new Date()) return res.status(400).json({ error: { code: 'INVALID_RESERVATION_TIME', message: 'Reservation must start in the future' } });
    const location = await ParkingLocation.findOne({ _id: locationId, status: 'active' });
    if (!location) return res.status(404).json({ error: { code: 'LOCATION_NOT_FOUND', message: 'Parking location not found' } });
    const slot = await ParkingSlot.findOne({ _id: slotId, locationId, status: 'active' });
    if (!slot) return res.status(404).json({ error: { code: 'SLOT_NOT_FOUND', message: 'This parking slot is not available for booking' } });
    if (!isWithinOperatingHours(location, startAt, endAt)) return res.status(400).json({ error: { code: 'OUTSIDE_OPERATING_HOURS', message: 'Reservation must fall within this location’s operating hours' } });

    const durationMinutes = (endAt.getTime() - startAt.getTime()) / minuteMs;
    const billableHours = Math.ceil(durationMinutes / 60);
    const booking = new Booking({
      customerId: req.user.id,
      ownerId: location.ownerId,
      locationId: location.id,
      slotId: slot.id,
      startAt,
      endAt,
      hourlyPricePaise: slot.hourlyPricePaise,
      amountPaise: billableHours * slot.hourlyPricePaise,
      currency: 'INR',
      status: 'confirmed',
    });

    try {
      await ReservationClaim.insertMany(bookingMinuteClaims(booking, slot._id));
      await booking.save();
    } catch (error) {
      await ReservationClaim.deleteMany({ bookingId: booking._id }).catch(() => {});
      if (error.code === 11000 || error.writeErrors?.some((writeError) => writeError.code === 11000)) {
        return res.status(409).json({ error: { code: 'SLOT_UNAVAILABLE', message: 'This slot was just reserved for part or all of that time. Choose another time or slot.' } });
      }
      return next(error);
    }
    const slotHasClaim = await ReservationClaim.exists({ slotId: slot.id, minuteStart: { $gte: startAt, $lt: endAt }, active: true });
    publishAvailability(location.id, { slotId: slot.id, startAt, endAt, available: !slotHasClaim });
    return res.status(201).json({ booking: bookingView(booking), price: { amountPaise: booking.amountPaise, currency: booking.currency, billableHours } });
  } catch (error) { return next(error); }
});

bookingRouter.get('/', authenticate, requireRoles('customer', 'admin'), async (req, res, next) => {
  try {
    const filter = req.user.role === 'admin' && req.query.customerId && isValidId(req.query.customerId)
      ? { customerId: req.query.customerId }
      : req.user.role === 'admin' ? {} : { customerId: req.user.id };
    const bookings = await Booking.find(filter).populate('locationId').populate('slotId').sort({ createdAt: -1 }).limit(100);
    return res.json({ bookings: bookings.map(bookingView) });
  } catch (error) { return next(error); }
});

bookingRouter.get('/:bookingId', authenticate, requireRoles('customer', 'admin'), async (req, res, next) => {
  if (!isValidId(req.params.bookingId)) return res.status(404).json({ error: { code: 'BOOKING_NOT_FOUND', message: 'Booking not found' } });
  try {
    const filter = req.user.role === 'admin' ? { _id: req.params.bookingId } : { _id: req.params.bookingId, customerId: req.user.id };
    const booking = await Booking.findOne(filter).populate('locationId').populate('slotId');
    if (!booking) return res.status(404).json({ error: { code: 'BOOKING_NOT_FOUND', message: 'Booking not found' } });
    return res.json({ booking: bookingView(booking) });
  } catch (error) { return next(error); }
});

bookingRouter.post('/:bookingId/cancel', authenticate, requireRoles('customer'), bookingLimiter, async (req, res, next) => {
  if (!isValidId(req.params.bookingId)) return res.status(404).json({ error: { code: 'BOOKING_NOT_FOUND', message: 'Booking not found' } });
  try {
    const now = new Date();
    const booking = await Booking.findOneAndUpdate({ _id: req.params.bookingId, customerId: req.user.id, status: 'confirmed', paymentStatus: { $ne: 'paid' }, startAt: { $gt: now } }, { $set: { status: 'cancelled', cancelledAt: now } }, { new: true });
    if (!booking) {
      const ownedBooking = await Booking.exists({ _id: req.params.bookingId, customerId: req.user.id });
      if (!ownedBooking) return res.status(404).json({ error: { code: 'BOOKING_NOT_FOUND', message: 'Booking not found' } });
      if (ownedBooking && await Booking.exists({ _id: req.params.bookingId, paymentStatus: 'paid' })) return res.status(409).json({ error: { code: 'REFUND_REQUIRED', message: 'Paid bookings require owner or administrator reconciliation before cancellation' } });
      return res.status(409).json({ error: { code: 'BOOKING_CANNOT_BE_CANCELLED', message: 'Only unpaid confirmed bookings that have not started can be cancelled' } });
    }
    await ReservationClaim.updateMany({ bookingId: booking.id, active: true }, { $set: { active: false, expiresAt: new Date() } });
    const slotHasClaim = await ReservationClaim.exists({ slotId: booking.slotId, minuteStart: { $gte: booking.startAt, $lt: booking.endAt }, active: true });
    publishAvailability(booking.locationId, { slotId: booking.slotId, startAt: booking.startAt, endAt: booking.endAt, available: !slotHasClaim });
    return res.json({ booking: bookingView(booking) });
  } catch (error) { return next(error); }
});

ownerBookingRouter.get('/', authenticate, requireRoles('parking_owner', 'admin'), async (req, res, next) => {
  try {
    const filter = req.user.role === 'admin' ? {} : { ownerId: req.user.id };
    if (['confirmed', 'cancelled', 'completed'].includes(req.query.status)) filter.status = req.query.status;
    const bookings = await Booking.find(filter).populate('customerId', 'name email').populate('locationId').populate('slotId').sort({ startAt: 1 }).limit(200);
    return res.json({ bookings: bookings.map(bookingView) });
  } catch (error) { return next(error); }
});

ownerBookingRouter.post('/:bookingId/complete', authenticate, requireRoles('parking_owner', 'admin'), async (req, res, next) => {
  if (!isValidId(req.params.bookingId)) return res.status(404).json({ error: { code: 'BOOKING_NOT_FOUND', message: 'Booking not found' } });
  try {
    const filter = { _id: req.params.bookingId, status: 'confirmed', endAt: { $lte: new Date() } };
    if (req.user.role !== 'admin') filter.ownerId = req.user.id;
    const booking = await Booking.findOneAndUpdate(filter, { $set: { status: 'completed', completedAt: new Date() } }, { new: true });
    if (!booking) return res.status(409).json({ error: { code: 'BOOKING_CANNOT_BE_COMPLETED', message: 'Only an ended confirmed booking managed by your account can be completed' } });
    return res.json({ booking: bookingView(booking) });
  } catch (error) { return next(error); }
});
