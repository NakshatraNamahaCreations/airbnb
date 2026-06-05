import mongoose from 'mongoose';
import asyncHandler from '../middlewares/asyncHandler.js';
import { apiLogger } from '../utils/logger.js';
import { ValidationError, NotFoundError } from '../utils/error.js';

import Subscription from '../models/subscription.model.js';
import Payment from '../models/payment.model.js';

import razorpayService from '../services/razorpay.service.js';
import { verifyCheckoutSignature } from '../utils/signature.js';
import { getKeySecret } from '../config/razorpay.js';
import { SUBSCRIPTION_PLANS, CURRENCY, BOOKING_PAYMENT_TTL_MIN } from '../constants/payment.js';

/* -------------------------------------------------------------------------- */
/* helpers                                                                    */
/* -------------------------------------------------------------------------- */

const getActiveSubscription = async (userId) => {
  return Subscription.findOne({
    userId,
    status: 'active',
    activeUntil: { $gt: new Date() },
  }).sort({ activeUntil: -1 });
};

/* -------------------------------------------------------------------------- */
/* POST /subscriptions/order                                                  */
/* -------------------------------------------------------------------------- */

const createSubscriptionOrder = asyncHandler(async (req, res) => {
  const { userId } = req;
  const { plan: planId = 'premium_monthly' } = req.body || {};

  const plan = SUBSCRIPTION_PLANS[planId];
  if (!plan) {
    throw new ValidationError('UNKNOWN_PLAN', `Unknown plan: ${planId}`);
  }

  const existing = await getActiveSubscription(userId);
  if (existing) {
    return res.status(400).json({
      code: 'ALREADY_ACTIVE',
      message: 'You already have an active subscription',
      data: { plan: existing.plan, activeUntil: existing.activeUntil },
    });
  }

  // Create pending intent
  const intent = await Subscription.create({
    userId,
    plan: plan.id,
    amountPaise: plan.amountPaise,
    currency: plan.currency,
    status: 'pending_payment',
    expiresAt: new Date(Date.now() + BOOKING_PAYMENT_TTL_MIN * 60 * 1000),
  });

  let order;
  try {
    order = await razorpayService.createOrder({
      amountPaise: plan.amountPaise,
      receipt: String(intent._id),
      notes: { intentId: String(intent._id), userId: String(userId), plan: plan.id },
      currency: plan.currency,
    });
  } catch (err) {
    await Subscription.deleteOne({ _id: intent._id });
    apiLogger.error('razorpay.createOrder (subscription) failed', { err: err.message });
    throw new ValidationError('PAYMENT_GATEWAY', 'Could not create payment order');
  }

  intent.razorpayOrderId = order.id;
  await intent.save();

  return res.status(201).json({
    intentId: String(intent._id),
    orderId: order.id,
    amount: plan.amountPaise,
    currency: plan.currency,
    plan: plan.id,
    expiresAt: intent.expiresAt,
  });
});

/* -------------------------------------------------------------------------- */
/* POST /subscriptions/verify                                                 */
/* -------------------------------------------------------------------------- */

const verifySubscriptionPayment = asyncHandler(async (req, res) => {
  const { userId } = req;
  const { intentId, razorpayOrderId, razorpayPaymentId, razorpaySignature } = req.body || {};

  if (!intentId || !razorpayOrderId || !razorpayPaymentId || !razorpaySignature) {
    throw new ValidationError('VALIDATION', 'intentId, razorpayOrderId, razorpayPaymentId, razorpaySignature are required');
  }
  if (!mongoose.Types.ObjectId.isValid(intentId)) {
    throw new ValidationError('VALIDATION', 'invalid intentId');
  }

  const sub = await Subscription.findById(intentId);
  if (!sub) throw new NotFoundError('Subscription intent not found');
  if (String(sub.userId) !== String(userId)) {
    throw new ValidationError('FORBIDDEN', 'Not your subscription');
  }
  if (sub.razorpayOrderId !== razorpayOrderId) {
    throw new ValidationError('ORDER_BOOKING_MISMATCH', 'Order does not belong to this intent');
  }

  // Idempotency
  if (sub.status === 'active' && sub.razorpayPaymentId === razorpayPaymentId) {
    return res.status(200).json({
      status: 'active',
      plan: sub.plan,
      activeUntil: sub.activeUntil,
      lastPaymentId: sub.razorpayPaymentId,
      idempotent: true,
    });
  }
  if (sub.status !== 'pending_payment') {
    throw new ValidationError('INTENT_NOT_PENDING', `Intent is in state ${sub.status}`);
  }
  if (sub.expiresAt && new Date() > sub.expiresAt) {
    sub.status = 'expired';
    await sub.save();
    throw new ValidationError('PAYMENT_EXPIRED', 'Payment window expired; create a new order');
  }

  // Signature
  const sigOk = verifyCheckoutSignature({
    orderId: razorpayOrderId,
    paymentId: razorpayPaymentId,
    signature: razorpaySignature,
    secret: getKeySecret(),
  });
  if (!sigOk) throw new ValidationError('SIGNATURE_MISMATCH', 'Payment signature verification failed');

  // Cross-check
  let payment;
  try {
    payment = await razorpayService.fetchPayment(razorpayPaymentId);
  } catch (err) {
    apiLogger.error('razorpay.fetchPayment (subscription) failed', { err: err.message });
    throw new ValidationError('PAYMENT_GATEWAY', 'Could not verify payment');
  }
  if (payment.order_id !== razorpayOrderId) {
    throw new ValidationError('ORDER_BOOKING_MISMATCH', 'Payment order does not match');
  }
  if (payment.status !== 'captured') {
    throw new ValidationError('PAYMENT_NOT_CAPTURED', `Payment status is ${payment.status}`);
  }
  if (Number(payment.amount) !== Number(sub.amountPaise)) {
    throw new ValidationError('AMOUNT_MISMATCH', 'Payment amount does not match plan price');
  }

  // Activate. If the user has another active sub somehow, extend rather than overwrite.
  const plan = SUBSCRIPTION_PLANS[sub.plan];
  const now = new Date();
  const baseStart = (await getActiveSubscription(userId))?.activeUntil || now;
  const start = baseStart > now ? baseStart : now;
  const activeUntil = new Date(start.getTime() + plan.durationDays * 24 * 60 * 60 * 1000);

  sub.status = 'active';
  sub.razorpayPaymentId = razorpayPaymentId;
  sub.razorpaySignature = razorpaySignature;
  sub.activeFrom = now;
  sub.activeUntil = activeUntil;
  sub.lastPaymentAt = now;
  sub.expiresAt = undefined;
  await sub.save();

  await Payment.findOneAndUpdate(
    { razorpayPaymentId },
    {
      $set: {
        userId,
        amount: sub.amountPaise,
        currency: sub.currency,
        status: 'captured',
        provider: 'razorpay',
        razorpayOrderId,
        razorpayPaymentId,
        razorpaySignature,
        capturedAt: now,
        meta: { kind: 'subscription', plan: sub.plan, subscriptionId: String(sub._id) },
      },
    },
    { upsert: true, new: true },
  );

  return res.status(200).json({
    status: 'active',
    plan: sub.plan,
    activeUntil: sub.activeUntil,
    lastPaymentId: razorpayPaymentId,
  });
});

/* -------------------------------------------------------------------------- */
/* GET /subscriptions/me                                                      */
/* -------------------------------------------------------------------------- */

const getMySubscription = asyncHandler(async (req, res) => {
  const { userId } = req;
  const active = await getActiveSubscription(userId);
  if (active) {
    return res.status(200).json({
      status: 'active',
      plan: active.plan,
      activeUntil: active.activeUntil,
    });
  }

  // Latest expired (or none) for UI display
  const latest = await Subscription.findOne({ userId }).sort({ updatedAt: -1 }).lean();
  if (!latest) {
    return res.status(200).json({ status: 'none', plan: null, activeUntil: null });
  }
  return res.status(200).json({
    status: latest.activeUntil && latest.activeUntil <= new Date() ? 'expired' : latest.status,
    plan: latest.plan,
    activeUntil: latest.activeUntil || null,
  });
});

export {
  createSubscriptionOrder,
  verifySubscriptionPayment,
  getMySubscription,
};
