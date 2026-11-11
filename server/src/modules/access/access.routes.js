import { Router } from 'express';
import crypto from 'node:crypto';
import mongoose from 'mongoose';
import { authenticate, requireRoles } from '../auth/auth.middleware.js';
import { Booking } from '../../models/Booking.js';
import { AccessCredential } from '../../models/AccessCredential.js';
import { ParkingLocation } from '../../models/ParkingLocation.js';

export const accessRouter = Router();
const fail = (res, status, code, message) => res.status(status).json({ error: { code, message } });
const hashToken = (token) => crypto.createHash('sha256').update(token).digest('hex');

accessRouter.post('/:bookingId/access-ticket', authenticate, requireRoles('customer'), async (req, res, next) => {
  try {
    if (!mongoose.isValidObjectId(req.params.bookingId)) return fail(res, 404, 'BOOKING_NOT_FOUND', 'Booking not found');
    const booking = await Booking.findOne({ _id: req.params.bookingId, customerId: req.user.id });
    if (!booking) return fail(res, 404, 'BOOKING_NOT_FOUND', 'Booking not found');
    if (booking.status !== 'confirmed' || booking.paymentStatus !== 'paid') return fail(res, 409, 'ACCESS_NOT_AVAILABLE', 'A confirmed paid booking is required');
    if (booking.accessState === 'exited') return fail(res, 409, 'BOOKING_ALREADY_EXITED', 'This parking session is complete');
    const now = new Date();
    const expiresAt = new Date(booking.endAt.getTime() + 12 * 60 * 60 * 1000);
    if (now > expiresAt || (booking.accessState === 'not_entered' && now > booking.endAt)) return fail(res, 409, 'ACCESS_WINDOW_CLOSED', 'This parking access window has closed');
    const purpose = booking.accessState === 'entered' ? 'exit' : 'entry';
    const token = crypto.randomBytes(32).toString('base64url');
    await AccessCredential.updateMany({ bookingId: booking.id, purpose: { $in: ['entry', 'exit'] }, consumedAt: null }, { $set: { purpose: 'revoked', revokedAt: now }, $unset: { tokenHash: 1 } });
    try { await AccessCredential.create({ bookingId: booking.id, customerId: req.user.id, tokenHash: hashToken(token), purpose, expiresAt, issuedAt: now, lastIssuedBy: req.user.id }); }
    catch (e) { if (e.code === 11000) return fail(res, 409, 'TICKET_ISSUANCE_IN_PROGRESS', 'A QR ticket is already being issued. Refresh and try again'); throw e; }
    return res.json({ ticket: { credential: token, purpose, expiresAt, booking: { id: booking.id, startAt: booking.startAt, endAt: booking.endAt, locationId: String(booking.locationId), slotId: String(booking.slotId) } } });
  } catch (e) { return next(e); }
});

accessRouter.post('/access/verify', authenticate, requireRoles('parking_owner', 'admin'), async (req, res, next) => {
  const { credential, action } = req.body ?? {};
  if (typeof credential !== 'string' || credential.length < 32 || credential.length > 200 || !['entry', 'exit'].includes(action)) return fail(res, 400, 'INVALID_ACCESS_REQUEST', 'Provide a valid QR credential and entry or exit action');
  try {
    const tokenHash = hashToken(credential);
    const ticket = await AccessCredential.findOne({ tokenHash }).select('+tokenHash');
    if (!ticket) return fail(res, 404, 'INVALID_QR_CREDENTIAL', 'QR credential is invalid or has already been used');
    const booking = await Booking.findById(ticket.bookingId);
    if (!booking) return fail(res, 404, 'BOOKING_NOT_FOUND', 'Booking not found');
    if (req.user.role !== 'admin') {
      const location = await ParkingLocation.findOne({ _id: booking.locationId, ownerId: req.user.id });
      if (!location) return fail(res, 403, 'FORBIDDEN', 'You cannot validate access for this location');
    }
    const now = new Date();
    if (ticket.customerId.toString() !== booking.customerId.toString() || booking.status !== 'confirmed' || booking.paymentStatus !== 'paid') return fail(res, 403, 'ACCESS_NOT_AUTHORIZED', 'This QR credential is not authorized for an active paid booking');
    if (ticket.purpose !== action) return fail(res, 409, 'INVALID_ACCESS_TRANSITION', `This credential is valid for ${ticket.purpose}, not ${action}`);
    if (ticket.expiresAt <= now) return fail(res, 410, 'QR_CREDENTIAL_EXPIRED', 'QR credential has expired');
    if (action === 'entry') {
      if (booking.accessState !== 'not_entered' || now < booking.startAt || now > booking.endAt) return fail(res, 409, 'INVALID_ACCESS_TRANSITION', 'Entry is only available during the booking window and can occur once');
    } else if (booking.accessState !== 'entered' || !booking.entryAt || now < booking.entryAt) return fail(res, 409, 'INVALID_ACCESS_TRANSITION', 'Exit requires a recorded entry and can occur once');
    const consumed = await AccessCredential.findOneAndUpdate({ _id: ticket.id, tokenHash, purpose: action, consumedAt: null, expiresAt: { $gt: now } }, { $set: { consumedAt: now, purpose: 'completed' }, $unset: { tokenHash: 1 } }, { new: true });
    if (!consumed) return fail(res, 409, 'QR_CREDENTIAL_REUSED', 'This QR credential has already been used');
    const update = action === 'entry'
      ? { $set: { accessState: 'entered', entryAt: now }, $push: { accessHistory: { type: 'entry', verifiedBy: req.user.id, credentialId: ticket.id, at: now } } }
      : { $set: { accessState: 'exited', exitAt: now }, $push: { accessHistory: { type: 'exit', verifiedBy: req.user.id, credentialId: ticket.id, at: now } } };
    const changed = await Booking.findOneAndUpdate({ _id: booking.id, accessState: action === 'entry' ? 'not_entered' : 'entered', status: 'confirmed', paymentStatus: 'paid' }, update, { new: true });
    if (!changed) return fail(res, 409, 'INVALID_ACCESS_TRANSITION', 'Parking session changed; refresh and scan again');
    return res.json({ verified: true, action, bookingId: booking.id, accessState: changed.accessState, entryAt: changed.entryAt, exitAt: changed.exitAt, verifiedAt: now });
  } catch (e) { return next(e); }
});
