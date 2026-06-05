import { getRazorpay } from '../config/razorpay.js';

/**
 * Create an order on Razorpay.
 * @param {Object} p
 * @param {number} p.amountPaise  amount in paise (integer)
 * @param {string} p.receipt      our internal id (booking._id / subscription._id)
 * @param {Object} p.notes        free-form, surfaced in dashboard
 * @param {string} p.currency
 */
const createOrder = async ({ amountPaise, receipt, notes = {}, currency = 'INR' }) => {
  const rp = getRazorpay();
  return rp.orders.create({
    amount: amountPaise,
    currency,
    receipt: String(receipt),
    notes,
    payment_capture: 1,
  });
};

/**
 * Fetch a payment. Used to cross-check status/amount/order_id during /verify
 * — guards against an attacker replaying someone else's signed payment.
 */
const fetchPayment = async (paymentId) => {
  const rp = getRazorpay();
  return rp.payments.fetch(paymentId);
};

/**
 * Issue a refund.
 * @param {Object} p
 * @param {string} p.paymentId
 * @param {number} p.amountPaise   integer paise
 * @param {Object} p.notes
 * @param {string} p.speed         'normal' or 'optimum'
 */
const refundPayment = async ({ paymentId, amountPaise, notes = {}, speed = 'normal' }) => {
  const rp = getRazorpay();
  return rp.payments.refund(paymentId, {
    amount: amountPaise,
    speed,
    notes,
  });
};

export default { createOrder, fetchPayment, refundPayment };
