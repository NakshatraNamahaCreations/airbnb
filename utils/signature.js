import crypto from 'crypto';

/**
 * Constant-time equality of two hex strings.
 *
 * Returns false (never throws) for length mismatch / non-hex input — so callers
 * can treat any falsy result as "signature did not match".
 */
const safeHexEqual = (a, b) => {
  if (typeof a !== 'string' || typeof b !== 'string') return false;
  if (a.length !== b.length) return false;
  try {
    return crypto.timingSafeEqual(Buffer.from(a, 'hex'), Buffer.from(b, 'hex'));
  } catch {
    return false;
  }
};

/**
 * Verify the Razorpay checkout signature returned to the client.
 * Payload: `${razorpay_order_id}|${razorpay_payment_id}`
 */
const verifyCheckoutSignature = ({ orderId, paymentId, signature, secret }) => {
  if (!orderId || !paymentId || !signature || !secret) return false;
  const expected = crypto
    .createHmac('sha256', secret)
    .update(`${orderId}|${paymentId}`)
    .digest('hex');
  return safeHexEqual(expected, signature);
};

/**
 * Verify a Razorpay webhook signature.
 * Razorpay signs the RAW request body bytes with the webhook secret.
 * Caller MUST pass the raw body Buffer/string, not the parsed object.
 */
const verifyWebhookSignature = ({ rawBody, signature, secret }) => {
  if (!rawBody || !signature || !secret) return false;
  const body =
    Buffer.isBuffer(rawBody) ? rawBody : Buffer.from(String(rawBody), 'utf8');
  const expected = crypto
    .createHmac('sha256', secret)
    .update(body)
    .digest('hex');
  return safeHexEqual(expected, signature);
};

export { verifyCheckoutSignature, verifyWebhookSignature, safeHexEqual };
