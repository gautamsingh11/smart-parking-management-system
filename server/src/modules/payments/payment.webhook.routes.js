import { Router } from 'express';
import express from 'express';
import crypto from 'node:crypto';
import { Payment } from '../../models/Payment.js';
import { Booking } from '../../models/Booking.js';
import { PaymentWebhookEvent } from '../../models/PaymentWebhookEvent.js';
import { getRazorpayConfig } from '../../config/env.js';

export const paymentWebhookRouter = Router();
paymentWebhookRouter.use(express.raw({ type: 'application/json', limit: '1mb' }));
paymentWebhookRouter.post('/', (req, res, next) => {
  try {
    if (!Buffer.isBuffer(req.body)) return res.status(415).json({ error: { code: 'UNSUPPORTED_WEBHOOK_CONTENT_TYPE', message: 'Webhook requests must use application/json' } });
    const config = getRazorpayConfig({ requireWebhookSecret: true });
    if (!config) return res.status(503).json({ error: { code: 'WEBHOOK_NOT_CONFIGURED', message: 'Payment webhook is not configured' } });
    const raw = req.body;
    const supplied = req.get('x-razorpay-signature') ?? '';
    const expected = crypto.createHmac('sha256', config.webhookSecret).update(raw).digest();
    let signature; try { signature = Buffer.from(supplied, 'hex'); } catch { signature = Buffer.alloc(0); }
    if (signature.length !== expected.length || !crypto.timingSafeEqual(signature, expected)) return res.status(400).json({ error: { code: 'INVALID_WEBHOOK_SIGNATURE', message: 'Webhook signature is invalid' } });
    let event;
    try { event = JSON.parse(raw.toString('utf8')); } catch { return res.status(400).json({ error: { code: 'INVALID_WEBHOOK_PAYLOAD', message: 'Webhook body must contain valid JSON' } }); }
    return processEvent(req, res, event).catch(next);
  } catch (e) { return next(e); }
});

async function processEvent(req, res, event) {
  const eventId = req.get('x-razorpay-event-id');
  if (!eventId || eventId.length > 160) return res.status(400).json({ error: { code: 'INVALID_WEBHOOK_EVENT', message: 'Webhook event ID is required' } });
  const pay = event.payload?.payment?.entity;
  let record;
  try { record = await PaymentWebhookEvent.create({ eventId, eventType: event.event ?? 'unknown', providerOrderId: pay?.order_id, providerPaymentId: pay?.id }); }
  catch (e) {
    if (e.code !== 11000) throw e;
    record = await PaymentWebhookEvent.findOne({ eventId });
    if (!record || ['processed', 'ignored'].includes(record.status)) return res.status(200).json({ received: true, duplicate: true });
    if (record.status === 'processing') return res.status(202).json({ received: true, duplicate: true, processing: true });
    record = await PaymentWebhookEvent.findOneAndUpdate({ eventId, status: 'failed' }, { $set: { status: 'processing', failureCode: null } }, { new: true });
    if (!record) return res.status(202).json({ received: true, duplicate: true, processing: true });
  }
  try {
    if (!pay?.order_id || !pay?.id) { record.status = 'ignored'; await record.save(); return res.json({ received: true, ignored: true }); }
    const payment = await Payment.findOne({ providerOrderId: pay.order_id });
    if (!payment) { record.status = 'ignored'; await record.save(); return res.json({ received: true, ignored: true }); }
    if (event.event === 'payment.captured' && pay.status === 'captured' && pay.amount === payment.amountPaise && pay.currency === payment.currency) {
      if (payment.status !== 'captured') { payment.providerPaymentId = pay.id; payment.status = 'captured'; payment.capturedAt = pay.created_at ? new Date(pay.created_at * 1000) : new Date(); await payment.save(); }
      const booking = await Booking.findById(payment.bookingId);
      if (booking?.status === 'confirmed' && booking.amountPaise === payment.amountPaise) await Booking.updateOne({ _id: booking.id, paymentStatus: { $ne: 'paid' }, status: 'confirmed' }, { $set: { paymentStatus: 'paid' } });
      else { payment.status = 'reconciliation_required'; await payment.save(); }
    } else if (event.event === 'payment.failed' && payment.status !== 'captured') {
      payment.status = 'failed'; payment.providerPaymentId = pay.id; payment.failureCode = pay.error_code ?? 'PAYMENT_FAILED'; payment.failureDescription = pay.error_description ?? null; payment.failedAt = new Date(); await payment.save();
      await Booking.updateOne({ _id: payment.bookingId, paymentStatus: 'pending' }, { $set: { paymentStatus: 'failed' } });
    } else { record.status = 'ignored'; }
    if (record.status !== 'ignored') record.status = 'processed';
    record.processedAt = new Date(); await record.save();
    return res.json({ received: true });
  } catch (e) { record.status = 'failed'; record.failureCode = 'PROCESSING_FAILED'; await record.save(); throw e; }
}
