/**
 * In-process expiry job. Sweeps stale `pending_payment` bookings and
 * subscriptions whose `expiresAt` has passed and flips them to `expired`.
 *
 * Runs on `setInterval` every `EXPIRY_JOB_INTERVAL_MIN` minutes (default 5).
 * Disable in this process by setting `EXPIRY_JOB_DISABLED=true` (useful when
 * running this work via an external cron job instead).
 *
 * Idempotent — only updates docs that are still `pending_payment` AND past
 * their `expiresAt`. Safe to run concurrently with the request-time check in
 * /verify (which also flips to `expired` on demand).
 */
import Booking from '../models/booking.model.js';
import Subscription from '../models/subscription.model.js';
import { apiLogger } from '../utils/logger.js';

const DEFAULT_INTERVAL_MIN = 5;

const sweepBookings = async () => {
  const result = await Booking.updateMany(
    { status: 'pending_payment', expiresAt: { $lte: new Date() } },
    { $set: { status: 'expired' } },
  );
  return result.modifiedCount || 0;
};

const sweepSubscriptions = async () => {
  const result = await Subscription.updateMany(
    { status: 'pending_payment', expiresAt: { $lte: new Date() } },
    { $set: { status: 'expired' } },
  );
  return result.modifiedCount || 0;
};

/**
 * Run one sweep. Returns counts. Catches per-collection errors so a
 * failure in one sweep doesn't skip the other.
 */
const runOnce = async () => {
  let bookings = 0;
  let subscriptions = 0;

  try { bookings = await sweepBookings(); }
  catch (err) { apiLogger.error('expiryJob: bookings sweep failed', { err: err.message }); }

  try { subscriptions = await sweepSubscriptions(); }
  catch (err) { apiLogger.error('expiryJob: subscriptions sweep failed', { err: err.message }); }

  if (bookings || subscriptions) {
    apiLogger.info('expiryJob swept', { bookings, subscriptions });
  }
  return { bookings, subscriptions };
};

let _timer = null;

const start = () => {
  if (process.env.EXPIRY_JOB_DISABLED === 'true') {
    apiLogger.info('expiryJob disabled via EXPIRY_JOB_DISABLED');
    return;
  }
  if (_timer) return; // already running

  const minutes = Math.max(
    1,
    Number.parseInt(process.env.EXPIRY_JOB_INTERVAL_MIN ?? '', 10) || DEFAULT_INTERVAL_MIN,
  );
  const intervalMs = minutes * 60 * 1000;

  // Kick off once shortly after boot, then on the interval.
  setTimeout(() => { runOnce().catch(() => {}); }, 30 * 1000);
  _timer = setInterval(() => { runOnce().catch(() => {}); }, intervalMs);
  _timer.unref?.(); // don't keep the process alive just for this timer

  apiLogger.info(`expiryJob started — every ${minutes} min`);
};

const stop = () => {
  if (_timer) {
    clearInterval(_timer);
    _timer = null;
  }
};

export default { start, stop, runOnce };
