import { CANCELLATION_POLICIES, DEFAULT_CANCELLATION_POLICY } from '../constants/payment.js';

/**
 * Compute the refund breakdown for a booking cancellation.
 *
 * Inputs in paise (integer). Time inputs as Date or ISO string.
 *
 * Rules:
 *   - subtotal is refunded at `refundFraction` per the policy tier and the
 *     time until check-in.
 *   - tax is refunded proportional to the subtotal refund fraction.
 *   - service fee is NEVER refunded.
 *   - All output integers (paise).
 *
 * @param {Object} p
 * @param {('flexible'|'moderate'|'strict')} p.policy
 * @param {Date|string} p.checkInDate
 * @param {Date|string} [p.cancelledAt]   defaults to now
 * @param {number} p.subtotalPaise
 * @param {number} p.taxPaise
 * @param {number} p.serviceFeePaise
 *
 * @returns {{
 *   refundFraction: number,
 *   subtotalRefundPaise: number,
 *   taxRefundPaise: number,
 *   serviceFeeRefundPaise: number,
 *   totalRefundPaise: number,
 *   policy: string,
 *   ruleAppliedHoursBefore: number,
 *   hoursBeforeCheckIn: number
 * }}
 */
const computeRefund = ({
  policy,
  checkInDate,
  cancelledAt,
  subtotalPaise = 0,
  taxPaise = 0,
  serviceFeePaise = 0,
}) => {
  const tier = CANCELLATION_POLICIES[policy] || CANCELLATION_POLICIES[DEFAULT_CANCELLATION_POLICY];
  const now = cancelledAt ? new Date(cancelledAt) : new Date();
  const checkIn = new Date(checkInDate);

  const hoursBefore = Math.max(0, (checkIn.getTime() - now.getTime()) / (1000 * 60 * 60));

  // Rules are descending by threshold; first match wins.
  let refundFraction = 0;
  let ruleAppliedHoursBefore = 0;
  for (const rule of tier.rules) {
    if (hoursBefore >= rule.hoursBefore) {
      refundFraction = rule.refundFraction;
      ruleAppliedHoursBefore = rule.hoursBefore;
      break;
    }
  }

  const subtotalRefundPaise = Math.floor(subtotalPaise * refundFraction);
  const taxRefundPaise      = Math.floor(taxPaise      * refundFraction);
  const serviceFeeRefundPaise = 0; // never refundable
  const totalRefundPaise = subtotalRefundPaise + taxRefundPaise + serviceFeeRefundPaise;

  return {
    refundFraction,
    subtotalRefundPaise,
    taxRefundPaise,
    serviceFeeRefundPaise,
    totalRefundPaise,
    policy: tier.label.toLowerCase(),
    ruleAppliedHoursBefore,
    hoursBeforeCheckIn: Math.round(hoursBefore * 10) / 10, // 1 dp
  };
};

export default { computeRefund };
