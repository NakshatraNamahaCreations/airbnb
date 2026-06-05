import Razorpay from 'razorpay';

/**
 * Lazy singleton — the SDK constructor reads env at instantiation, so we defer
 * until first use to play nicely with `import "dotenv/config"` ordering.
 *
 * Required env:
 *   RAZORPAY_KEY_ID
 *   RAZORPAY_KEY_SECRET
 *   RAZORPAY_WEBHOOK_SECRET   (used for webhook signature verification only)
 */
let _instance = null;

const getRazorpay = () => {
  if (_instance) return _instance;

  const key_id = process.env.RAZORPAY_KEY_ID;
  const key_secret = process.env.RAZORPAY_KEY_SECRET;

  if (!key_id || !key_secret) {
    throw new Error(
      'Razorpay env vars missing: set RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET',
    );
  }
  _instance = new Razorpay({ key_id, key_secret });
  return _instance;
};

const getKeySecret = () => {
  const s = process.env.RAZORPAY_KEY_SECRET;
  if (!s) throw new Error('RAZORPAY_KEY_SECRET not configured');
  return s;
};

const getWebhookSecret = () => {
  const s = process.env.RAZORPAY_WEBHOOK_SECRET;
  if (!s) throw new Error('RAZORPAY_WEBHOOK_SECRET not configured');
  return s;
};

export { getRazorpay, getKeySecret, getWebhookSecret };
