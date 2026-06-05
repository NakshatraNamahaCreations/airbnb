/**
 * Payment / billing constants. All money in paise (integer).
 *
 * Override via env if needed:
 *   BOOKING_TAX_PERCENT       — default 12
 *   SERVICE_FEE_PAISE         — default 9900 (₹99)
 *   BOOKING_PAYMENT_TTL_MIN   — default 15 (minutes a pending_payment booking can sit)
 */

const TAX_PERCENT =
  Number.parseFloat(process.env.BOOKING_TAX_PERCENT ?? '0');

const SERVICE_FEE_PAISE =
  Number.parseInt(process.env.SERVICE_FEE_PAISE ?? '0', 10);

const BOOKING_PAYMENT_TTL_MIN =
  Number.parseInt(process.env.BOOKING_PAYMENT_TTL_MIN ?? '15', 10);

const CURRENCY = 'INR';

/**
 * Subscription plans. Server-authoritative — never trust amount from the client.
 * Keyed by plan id sent in the request body.
 */
const SUBSCRIPTION_PLANS = {
  premium_monthly: {
    id: 'premium_monthly',
    label: 'Premium (monthly)',
    amountPaise: 19900,        // ₹199
    durationDays: 30,
    currency: CURRENCY,
  },
};

/**
 * Cancellation policy tiers — Airbnb-style.
 * `hoursBefore` = hours between cancellation and check-in.
 *
 * For each tier, the first rule whose threshold the cancellation meets applies.
 * (Rules listed in descending threshold order.)
 *
 * `refundFraction` applies to the subtotal (nights * pricePerNight). Tax is refunded
 * proportionally with the subtotal. Service fee is NEVER refunded.
 */
const CANCELLATION_POLICIES = {
  flexible: {
    label: 'Flexible',
    rules: [
      { hoursBefore: 24, refundFraction: 1.0 }, // ≥24h before → full refund
      { hoursBefore: 0,  refundFraction: 0.0 }, // <24h → none
    ],
  },
  moderate: {
    label: 'Moderate',
    rules: [
      { hoursBefore: 24 * 5, refundFraction: 1.0 }, // ≥5 days → full
      { hoursBefore: 24,     refundFraction: 0.5 }, // ≥24h   → 50%
      { hoursBefore: 0,      refundFraction: 0.0 }, // <24h   → none
    ],
  },
  strict: {
    label: 'Strict',
    rules: [
      { hoursBefore: 24 * 7, refundFraction: 0.5 }, // ≥7 days → 50%
      { hoursBefore: 0,      refundFraction: 0.0 }, // <7 days → none
    ],
  },
};

const DEFAULT_CANCELLATION_POLICY = 'moderate';

/**
 * Booking statuses driven by the payment flow:
 *   pending_payment → user has an order, waiting for Razorpay verify
 *   confirmed       → verified, active booking
 *   cancelled       → user cancelled (refund per policy)
 *   cancelled_by_admin → admin cancelled
 *   expired         → never verified inside TTL
 *   failed          → payment.failed webhook
 *   completed       → after checkout
 *   no_show         → guest never showed up
 *
 * Legacy values ('pending', 'accepted', 'rejected', 'cancelled_by_guest') are
 * still accepted by the schema enum so existing rows can still be read; no new
 * code path produces them.
 */
const BOOKING_STATUS_ALL = [
  // new flow
  'pending_payment',
  'confirmed',
  'cancelled',
  'cancelled_by_admin',
  'expired',
  'failed',
  'completed',
  'no_show',
  // legacy (kept for backward compat with existing data)
  'pending',
  'accepted',
  'rejected',
  'cancelled_by_guest',
];

export {
  TAX_PERCENT,
  SERVICE_FEE_PAISE,
  BOOKING_PAYMENT_TTL_MIN,
  CURRENCY,
  SUBSCRIPTION_PLANS,
  CANCELLATION_POLICIES,
  DEFAULT_CANCELLATION_POLICY,
  BOOKING_STATUS_ALL,
};
