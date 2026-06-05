import crypto from 'crypto';
import { apiLogger } from '../utils/logger.js';
import { verifyWebhookSignature } from '../utils/signature.js';
import { getWebhookSecret } from '../config/razorpay.js';

import PaymentEvent from '../models/paymentEvent.model.js';
import Booking from '../models/booking.model.js';
import Subscription from '../models/subscription.model.js';
import Payment from '../models/payment.model.js';

/**
 * POST /api/v1/payments/razorpay/webhook
 *
 * NOTE: this route is mounted with express.raw() so `req.body` is a Buffer.
 * Do not assume it's been JSON-parsed.
 */
const razorpayWebhook = async (req, res) => {
  const rawBody = req.body; // Buffer
  const signature = req.get('x-razorpay-signature');
  const eventIdHeader = req.get('x-razorpay-event-id');

  // 1. Verify signature against the raw body
  let ok = false;
  try {
    ok = verifyWebhookSignature({
      rawBody,
      signature,
      secret: getWebhookSecret(),
    });
  } catch (err) {
    apiLogger.error('webhook secret missing', { err: err.message });
    return res.status(500).json({ ok: false });
  }
  if (!ok) {
    apiLogger.warn('razorpay webhook signature mismatch', { signature });
    return res.status(400).json({ ok: false, message: 'invalid signature' });
  }

  // 2. Parse
  let body;
  try {
    body = JSON.parse(rawBody.toString('utf8'));
  } catch {
    return res.status(400).json({ ok: false, message: 'invalid json' });
  }

  const eventType = body.event;
  const payload = body.payload || {};
  const eventId =
    eventIdHeader ||
    // fall back to a deterministic id so duplicates of the same physical event still dedupe
    crypto
      .createHash('sha256')
      .update(
        `${eventType}|${payload?.payment?.entity?.id || ''}|${payload?.refund?.entity?.id || ''}|${body.created_at || ''}`,
      )
      .digest('hex');

  // 3. Idempotency — insert event row; on duplicate key, we've seen it before
  let eventRow;
  try {
    eventRow = await PaymentEvent.create({ eventId, eventType, payload: body });
  } catch (err) {
    if (err?.code === 11000) {
      apiLogger.info('webhook duplicate, skipping', { eventId, eventType });
      return res.status(200).json({ ok: true, duplicate: true });
    }
    apiLogger.error('webhook persist failed', { err: err.message });
    return res.status(500).json({ ok: false });
  }

  // 4. Respond fast; do the work but cap latency.
  res.status(200).json({ ok: true });

  // 5. Async-ish handling. We `await` because Node will run it next tick anyway;
  //    the response is already flushed.
  try {
    await handleEvent(eventType, payload);
    eventRow.status = 'processed';
    eventRow.processedAt = new Date();
    await eventRow.save();
  } catch (err) {
    apiLogger.error('webhook handler failed', { eventId, eventType, err: err.message });
    eventRow.status = 'failed';
    eventRow.error = err.message;
    await eventRow.save();
  }
};

/* -------------------------------------------------------------------------- */
/* event handlers                                                             */
/* -------------------------------------------------------------------------- */

const handleEvent = async (eventType, payload) => {
  switch (eventType) {
    case 'payment.captured':
      return handlePaymentCaptured(payload);
    case 'payment.failed':
      return handlePaymentFailed(payload);
    case 'refund.created':
    case 'refund.processed':
      return handleRefundProcessed(payload);
    case 'refund.failed':
      return handleRefundFailed(payload);
    default:
      apiLogger.info('webhook event ignored', { eventType });
      return;
  }
};

const handlePaymentCaptured = async (payload) => {
  const p = payload?.payment?.entity;
  if (!p) return;
  const { id: razorpayPaymentId, order_id: razorpayOrderId, amount } = p;

  // Try to match a booking by order id
  const booking = await Booking.findOne({ razorpayOrderId });
  if (booking) {
    // Confirm only if not already confirmed (verify endpoint will usually beat us)
    if (booking.status === 'pending_payment' && Number(amount) === Number(booking.amountPaise)) {
      booking.status = 'confirmed';
      booking.razorpayPaymentId = razorpayPaymentId;
      booking.confirmedAt = new Date();
      booking.expiresAt = undefined;
      await booking.save();
    }
    await Payment.findOneAndUpdate(
      { razorpayPaymentId },
      {
        $set: {
          bookingId: booking._id,
          userId: booking.guestId,
          amount,
          currency: booking.currency,
          status: 'captured',
          provider: 'razorpay',
          razorpayOrderId,
          razorpayPaymentId,
          capturedAt: new Date(),
        },
      },
      { upsert: true, new: true },
    );
    return;
  }

  // Otherwise try a subscription
  const sub = await Subscription.findOne({ razorpayOrderId });
  if (sub && sub.status === 'pending_payment' && Number(amount) === Number(sub.amountPaise)) {
    const now = new Date();
    const days = 30; // premium_monthly; if more plans, look up by sub.plan
    sub.status = 'active';
    sub.razorpayPaymentId = razorpayPaymentId;
    sub.activeFrom = now;
    sub.activeUntil = new Date(now.getTime() + days * 24 * 60 * 60 * 1000);
    sub.lastPaymentAt = now;
    sub.expiresAt = undefined;
    await sub.save();

    await Payment.findOneAndUpdate(
      { razorpayPaymentId },
      {
        $set: {
          userId: sub.userId,
          amount,
          currency: sub.currency,
          status: 'captured',
          provider: 'razorpay',
          razorpayOrderId,
          razorpayPaymentId,
          capturedAt: now,
          meta: { kind: 'subscription', plan: sub.plan, subscriptionId: String(sub._id) },
        },
      },
      { upsert: true, new: true },
    );
  }
};

const handlePaymentFailed = async (payload) => {
  const p = payload?.payment?.entity;
  if (!p) return;
  const { id: razorpayPaymentId, order_id: razorpayOrderId, error_description } = p;

  const booking = await Booking.findOne({ razorpayOrderId });
  if (booking && ['pending_payment'].includes(booking.status)) {
    booking.status = 'failed';
    await booking.save();
  }
  const sub = await Subscription.findOne({ razorpayOrderId });
  if (sub && sub.status === 'pending_payment') {
    sub.status = 'failed';
    await sub.save();
  }
  await Payment.findOneAndUpdate(
    { razorpayPaymentId },
    {
      $set: {
        status: 'failed',
        provider: 'razorpay',
        razorpayOrderId,
        razorpayPaymentId,
        failureReason: error_description || 'unknown',
      },
    },
    { upsert: true, new: true },
  );
};

const handleRefundProcessed = async (payload) => {
  const r = payload?.refund?.entity;
  if (!r) return;
  const { id: refundId, payment_id: razorpayPaymentId, amount, status } = r;

  await Payment.findOneAndUpdate(
    { razorpayPaymentId, 'refunds.refundId': refundId },
    { $set: { 'refunds.$.status': status } },
  );

  // Mirror onto booking
  const booking = await Booking.findOne({ razorpayPaymentId });
  if (booking) {
    booking.refundStatus = status;
    booking.razorpayRefundId = refundId;
    if (status === 'processed' || status === 'completed') {
      booking.refundAmountPaise = Number(amount);
    }
    await booking.save();
  }
};

const handleRefundFailed = async (payload) => {
  const r = payload?.refund?.entity;
  if (!r) return;
  await Payment.findOneAndUpdate(
    { 'refunds.refundId': r.id },
    { $set: { 'refunds.$.status': 'failed' } },
  );
  const booking = await Booking.findOne({ razorpayRefundId: r.id });
  if (booking) {
    booking.refundStatus = 'failed';
    await booking.save();
  }
};

export { razorpayWebhook };
