/**
 * Standalone one-shot version of the expiry job. Run from an external scheduler
 * (system cron, GitHub Actions, GCP Scheduler, etc.) if you'd rather not run
 * the in-process setInterval.
 *
 * Usage:
 *   node scripts/expirePendingBookings.js
 *
 * It exits with code 0 on success, 1 on failure.
 */
import 'dotenv/config';
import mongoose from 'mongoose';
import { connectDB } from '../config/db.js';
import expiryJob from '../services/expiryJob.service.js';

const run = async () => {
  try {
    await connectDB();
    const { bookings, subscriptions } = await expiryJob.runOnce();
    console.log(`Expired: ${bookings} booking(s), ${subscriptions} subscription(s).`);
    await mongoose.disconnect();
    process.exit(0);
  } catch (err) {
    console.error('expirePendingBookings failed:', err);
    process.exit(1);
  }
};

run();
