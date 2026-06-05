import mongoose from 'mongoose';
import { BOOKING_STATUS_ALL, BOOKING_PAYMENT_TTL_MIN } from '../constants/payment.js';

const bookingSchema = new mongoose.Schema({
  listingId: { type: mongoose.Schema.Types.ObjectId, ref: 'Listing', required: true },
  guestId:   { type: mongoose.Schema.Types.ObjectId, ref: 'User',    required: true, index: true },

  checkInDate:  { type: Date, required: true },
  checkOutDate: { type: Date, required: true },
  guests: {
    adults:   { type: Number, default: 0 },
    children: { type: Number, default: 0 },
    infants:  { type: Number, default: 0 },
    pets:     { type: Number, default: 0 },
  },

  message: { type: String },

  status: {
    type: String,
    enum: BOOKING_STATUS_ALL,
    default: 'pending_payment',
    index: true,
  },

  // money (paise — integer)
  amountPaise:     { type: Number, required: true, min: 0 },
  subtotalPaise:   { type: Number, default: 0 },     // nights * pricePerNight (no fee/tax)
  taxPaise:        { type: Number, default: 0 },
  serviceFeePaise: { type: Number, default: 0 },
  currency:        { type: String, default: 'INR' },

  // razorpay (denormalised onto the booking per spec)
  razorpayOrderId:   { type: String, index: true },
  razorpayPaymentId: { type: String, sparse: true, unique: true }, // idempotency
  razorpaySignature: { type: String },

  // policy snapshot at booking time (so future listing edits don't change refund math)
  cancellationPolicy: { type: String, enum: ['flexible', 'moderate', 'strict'], default: 'moderate' },

  // lifecycle timestamps
  confirmedAt:  { type: Date },
  cancelledAt:  { type: Date },
  expiresAt:    { type: Date, index: true }, // for pending_payment cleanup

  // cancellation / refund details
  cancellationReason: { type: String },
  cancelledByAdminId: { type: mongoose.Schema.Types.ObjectId, ref: 'Admin' },
  refundAmountPaise:  { type: Number, default: 0 },
  refundStatus:       { type: String }, // 'initiated' | 'processed' | 'failed'
  razorpayRefundId:   { type: String },

  // legacy
  rejectionReason: { type: String },
  completedAt:     { type: Date },
}, { timestamps: true });

// Helpful indexes
bookingSchema.index({ listingId: 1, status: 1, checkInDate: 1, checkOutDate: 1 });
bookingSchema.index({ razorpayOrderId: 1 });

const Booking = mongoose.model('Booking', bookingSchema);

export { BOOKING_STATUS_ALL as BOOKING_STATUS, BOOKING_PAYMENT_TTL_MIN };
export default Booking;
