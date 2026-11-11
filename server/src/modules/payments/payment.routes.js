import { Router } from 'express';
import crypto from 'node:crypto';
import Razorpay from 'razorpay';
import mongoose from 'mongoose';
import { authenticate, requireRoles } from '../auth/auth.middleware.js';
import { Booking } from '../../models/Booking.js';
import { Payment } from '../../models/Payment.js';
import { getRazorpayConfig } from '../../config/env.js';

const error = (res, status, code, message) => res.status(status).json({ error: { code, message } });
const safePayment = (p) => ({ id: String(p._id), bookingId: String(p.bookingId), amountPaise: p.amountPaise, currency: p.currency, status: p.status, providerOrderId: p.providerOrderId, providerPaymentId: p.providerPaymentId, createdAt: p.createdAt, capturedAt: p.capturedAt, failureCode: p.failureCode });

export function createPaymentRouter({ razorpayClient } = {}) {
  const router = Router();
  const clientFor = (config) => razorpayClient ?? new Razorpay({ key_id: config.keyId, key_secret: config.keySecret });
  router.post('/bookings/:bookingId/order', authenticate, requireRoles('customer'), async (req, res, next) => {
    try {
      if (!mongoose.isValidObjectId(req.params.bookingId)) return error(res, 404, 'BOOKING_NOT_FOUND', 'Booking not found');
      const booking = await Booking.findOne({ _id: req.params.bookingId, customerId: req.user.id });
      if (!booking) return error(res, 404, 'BOOKING_NOT_FOUND', 'Booking not found');
      if (booking.status !== 'confirmed' || booking.paymentStatus === 'paid') return error(res, 409, 'PAYMENT_NOT_AVAILABLE', 'This booking cannot be paid');
      let config;
      try { config = getRazorpayConfig(); } catch { return error(res, 503, 'PAYMENTS_NOT_CONFIGURED', 'Razorpay Test Mode is not configured'); }
      if (!config) return error(res, 503, 'PAYMENTS_NOT_CONFIGURED', 'Razorpay Test Mode is not configured');
      let payment = await Payment.findOne({ bookingId: booking.id }).sort({ attempt: -1 });
      if (payment && ['created', 'authorized'].includes(payment.status)) return res.json({ payment: safePayment(payment), checkout: { keyId: config.keyId, orderId: payment.providerOrderId, amount: payment.amountPaise, currency: payment.currency } });
      if (payment?.status === 'creating') return error(res, 409, 'PAYMENT_REQUEST_IN_PROGRESS', 'A payment request is already being processed');
      const attempt = (payment?.attempt ?? 0) + 1;
      const receipt = `booking-${booking.id}-${attempt}`;
      payment = new Payment({ bookingId: booking.id, customerId: req.user.id, attempt, receipt, amountPaise: booking.amountPaise, currency: booking.currency, status: 'creating' });
      try { await payment.save(); } catch (e) { if (e.code === 11000) return error(res, 409, 'PAYMENT_REQUEST_IN_PROGRESS', 'A payment request is already being processed'); throw e; }
      try {
        const order = await clientFor(config).orders.create({ amount: booking.amountPaise, currency: booking.currency, receipt, notes: { bookingId: booking.id } });
        payment.providerOrderId = order.id;
        payment.status = 'created';
        payment.createdAtProvider = order.created_at ? new Date(order.created_at * 1000) : new Date();
        await payment.save();
        return res.status(201).json({ payment: safePayment(payment), checkout: { keyId: config.keyId, orderId: order.id, amount: booking.amountPaise, currency: booking.currency } });
      } catch (e) { payment.status = 'failed'; payment.failureCode = 'ORDER_CREATION_FAILED'; await payment.save(); return next(e); }
    } catch (e) { return next(e); }
  });

  router.post('/verify', authenticate, requireRoles('customer'), async (req, res, next) => {
    try {
      const { razorpay_order_id: orderId, razorpay_payment_id: paymentId, razorpay_signature: signature } = req.body ?? {};
      if (![orderId, paymentId, signature].every((v) => typeof v === 'string' && v.length < 300)) return error(res, 400, 'INVALID_PAYMENT_RESPONSE', 'Payment verification details are invalid');
      const payment = await Payment.findOne({ providerOrderId: orderId, customerId: req.user.id });
      if (!payment) return error(res, 404, 'PAYMENT_NOT_FOUND', 'Payment order not found');
      if (payment.status === 'captured') return res.json({ payment: safePayment(payment), verified: true });
      const config = getRazorpayConfig();
      if (!config) return error(res, 503, 'PAYMENTS_NOT_CONFIGURED', 'Razorpay Test Mode is not configured');
      const expected = crypto.createHmac('sha256', config.keySecret).update(`${orderId}|${paymentId}`).digest();
      let supplied;
      try { supplied = Buffer.from(signature, 'hex'); } catch { supplied = Buffer.alloc(0); }
      if (supplied.length !== expected.length || !crypto.timingSafeEqual(expected, supplied)) return error(res, 400, 'INVALID_PAYMENT_SIGNATURE', 'Payment signature could not be verified');
      const providerPayment = await clientFor(config).payments.fetch(paymentId);
      if (providerPayment.order_id !== orderId || providerPayment.amount !== payment.amountPaise || providerPayment.currency !== payment.currency || providerPayment.status !== 'captured') return error(res, 409, 'PAYMENT_NOT_CAPTURED', 'Payment has not been captured for this booking');
      if (payment.status === 'captured') return res.json({ payment: safePayment(payment), verified: true });
      payment.providerPaymentId = paymentId;
      payment.status = 'captured';
      payment.capturedAt = new Date();
      await payment.save();
      const booking = await Booking.findById(payment.bookingId);
      if (booking?.status === 'confirmed' && booking.amountPaise === payment.amountPaise) {
        await Booking.updateOne({ _id: booking.id, status: 'confirmed', paymentStatus: { $ne: 'paid' } }, { $set: { paymentStatus: 'paid' } });
      } else {
        payment.status = 'reconciliation_required'; await payment.save();
        return res.status(202).json({ payment: safePayment(payment), verified: true, reconciliationRequired: true });
      }
      return res.json({ payment: safePayment(payment), verified: true });
    } catch (e) { return next(e); }
  });

  router.post('/:paymentId/cancel', authenticate, requireRoles('customer'), async (req, res, next) => {
    try {
      if (!mongoose.isValidObjectId(req.params.paymentId)) return error(res, 404, 'PAYMENT_NOT_CANCELLABLE', 'Payment attempt was not found or is already final');
      const payment = await Payment.findOneAndUpdate({ _id: req.params.paymentId, customerId: req.user.id, status: { $in: ['created', 'authorized'] } }, { $set: { status: 'cancelled', failureCode: 'CHECKOUT_DISMISSED' } }, { new: true });
      if (!payment) return error(res, 404, 'PAYMENT_NOT_CANCELLABLE', 'Payment attempt was not found or is already final');
      return res.json({ payment: safePayment(payment) });
    } catch (e) { return next(e); }
  });

  router.get('/history', authenticate, requireRoles('customer', 'admin'), async (req, res, next) => {
    try { const filter = req.user.role === 'admin' && req.query.customerId ? { customerId: req.query.customerId } : req.user.role === 'admin' ? {} : { customerId: req.user.id }; const payments = await Payment.find(filter).sort({ createdAt: -1 }).limit(100); return res.json({ payments: payments.map(safePayment) }); } catch (e) { return next(e); }
  });
  router.get('/reconciliation', authenticate, requireRoles('admin'), async (req, res, next) => {
    try { const payments = await Payment.find({ status: 'reconciliation_required' }).sort({ updatedAt: -1 }).limit(100); return res.json({ payments: payments.map(safePayment) }); } catch (e) { return next(e); }
  });
  router.get('/:paymentId/receipt', authenticate, requireRoles('customer', 'admin'), async (req, res, next) => {
    try { if (!mongoose.isValidObjectId(req.params.paymentId)) return error(res, 404, 'RECEIPT_NOT_FOUND', 'Receipt is available after a verified captured payment'); const filter = req.user.role === 'admin' ? { _id: req.params.paymentId } : { _id: req.params.paymentId, customerId: req.user.id }; const p = await Payment.findOne(filter); if (!p || p.status !== 'captured') return error(res, 404, 'RECEIPT_NOT_FOUND', 'Receipt is available after a verified captured payment'); const booking = await Booking.findById(p.bookingId).populate('locationId').populate('slotId'); return res.json({ receipt: { receiptNumber: p.receipt, paymentId: p.providerPaymentId, orderId: p.providerOrderId, amountPaise: p.amountPaise, currency: p.currency, paidAt: p.capturedAt, booking: booking ? { id: booking.id, location: booking.locationId?.name, slot: booking.slotId?.slotNumber, startAt: booking.startAt, endAt: booking.endAt } : null } }); } catch (e) { return next(e); }
  });
  return router;
}
