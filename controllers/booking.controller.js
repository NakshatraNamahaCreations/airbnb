import mongoose from 'mongoose';
import dayjs from 'dayjs';
import utc from 'dayjs/plugin/utc.js';
import isSameOrAfter from 'dayjs/plugin/isSameOrAfter.js';
import isSameOrBefore from 'dayjs/plugin/isSameOrBefore.js';

import asyncHandler from '../middlewares/asyncHandler.js';
import { apiLogger } from '../utils/logger.js';
import { NotFoundError, ValidationError, ConflictError } from '../utils/error.js';

import Booking from '../models/booking.model.js';
import Listing from '../models/listing.model.js';
import Payment from '../models/payment.model.js';

import bookingService from '../services/booking.service.js';
import razorpayService from '../services/razorpay.service.js';
import refundPolicyService from '../services/refundPolicy.service.js';

import { verifyCheckoutSignature } from '../utils/signature.js';
import { getKeySecret } from '../config/razorpay.js';
import {
  TAX_PERCENT,
  SERVICE_FEE_PAISE,
  BOOKING_PAYMENT_TTL_MIN,
  CURRENCY,
  DEFAULT_CANCELLATION_POLICY,
} from '../constants/payment.js';
import { parsePagination, buildPaginationMeta } from '../utils/pagination.js';

dayjs.extend(utc);
dayjs.extend(isSameOrAfter);
dayjs.extend(isSameOrBefore);

const ACTIVE_STATUSES = ['confirmed', 'accepted']; // statuses that block a date range
const TERMINAL_STATUSES = ['cancelled', 'cancelled_by_admin', 'expired', 'failed', 'rejected'];

/* -------------------------------------------------------------------------- */
/* PRICING                                                                    */
/* -------------------------------------------------------------------------- */

const nightsBetween = (checkIn, checkOut) => {
  const a = dayjs(checkIn).utc().startOf('day');
  const b = dayjs(checkOut).utc().startOf('day');
  const n = b.diff(a, 'day');
  return n > 0 ? n : 0;
};

const computePricing = (pricePerNight, nights) => {
  const subtotalRupees = Number(pricePerNight) * nights;
  const subtotalPaise = Math.round(subtotalRupees * 100);
  const taxPaise = Math.round((subtotalPaise * TAX_PERCENT) / 100);
  const serviceFeePaise = SERVICE_FEE_PAISE;
  const amountPaise = subtotalPaise + taxPaise + serviceFeePaise;
  return { subtotalPaise, taxPaise, serviceFeePaise, amountPaise };
};

/* -------------------------------------------------------------------------- */
/* /bookings/order                                                            */
/* -------------------------------------------------------------------------- */

const createBookingOrder = asyncHandler(async (req, res) => {
  const { userId } = req;
  const { listingId, checkInDate, checkOutDate, guests = {}, message } = req.body || {};

  if (!listingId || !checkInDate || !checkOutDate) {
    throw new ValidationError('VALIDATION', 'listingId, checkInDate, checkOutDate are required');
  }

  // Date validation
  const ci = dayjs(checkInDate, 'YYYY-MM-DD').utc().startOf('day');
  const co = dayjs(checkOutDate, 'YYYY-MM-DD').utc().startOf('day');
  if (!ci.isValid() || !co.isValid() || !co.isAfter(ci)) {
    throw new ValidationError('INVALID_DATES', 'Check-out must be after check-in');
  }
  const nights = co.diff(ci, 'day');
  if (nights < 1) {
    throw new ValidationError('INVALID_DATES', 'Booking must be at least 1 night');
  }

  // Listing check
  const listing = await Listing.findById(listingId);
  if (!listing) throw new NotFoundError('Listing not found');
  if (!['active', 'approved'].includes(listing.status)) {
    throw new ValidationError('LISTING_UNAVAILABLE', 'Listing is not available for booking');
  }

  // Capacity check (same contract as before)
  const adults   = Number(guests.adults   || 0);
  const children = Number(guests.children || 0);
  const infants  = Number(guests.infants  || 0);
  const pets     = Number(guests.pets     || 0);
  const totalGuests = adults + children;

  if (adults < 1) throw new ValidationError('ADULT_REQUIRED', 'At least one adult is required');
  if (totalGuests > listing.maxGuests) {
    throw new ValidationError('CAPACITY_EXCEEDED', `Total guests (${totalGuests}) exceed max allowed (${listing.maxGuests})`);
  }
  if (infants > (listing.maxInfants || 0)) {
    throw new ValidationError('INFANTS_EXCEEDED', `Infants (${infants}) exceed max allowed (${listing.maxInfants || 0})`);
  }
  if (pets > (listing.maxPets || 0)) {
    throw new ValidationError('PETS_EXCEEDED', `Pets (${pets}) exceed max allowed (${listing.maxPets || 0})`);
  }

  // Availability check — block on confirmed/accepted overlapping
  const overlap = await Booking.countDocuments({
    listingId,
    status: { $in: ACTIVE_STATUSES },
    checkInDate: { $lt: co.toDate() },
    checkOutDate: { $gt: ci.toDate() },
  });
  if (overlap > 0) {
    throw new ValidationError('DATES_UNAVAILABLE', 'Selected dates are not available');
  }

  // Pricing
  const { subtotalPaise, taxPaise, serviceFeePaise, amountPaise } =
    computePricing(listing.pricePerNight, nights);

  // Create the pending booking first so we can use its _id as the receipt.
  const booking = await Booking.create({
    listingId,
    guestId: userId,
    checkInDate: ci.toDate(),
    checkOutDate: co.toDate(),
    guests: { adults, children, infants, pets },
    message,
    status: 'pending_payment',
    amountPaise,
    subtotalPaise,
    taxPaise,
    serviceFeePaise,
    currency: CURRENCY,
    cancellationPolicy: listing.cancellationPolicy || DEFAULT_CANCELLATION_POLICY,
    expiresAt: new Date(Date.now() + BOOKING_PAYMENT_TTL_MIN * 60 * 1000),
  });

  // Create Razorpay order
  let order;
  try {
    order = await razorpayService.createOrder({
      amountPaise,
      receipt: String(booking._id),
      notes: {
        bookingId: String(booking._id),
        userId: String(userId),
        listingId: String(listingId),
      },
      currency: CURRENCY,
    });
  } catch (err) {
    // Rollback: don't leave an orphan pending booking
    await Booking.deleteOne({ _id: booking._id });
    apiLogger.error('razorpay.createOrder failed', { err: err.message });
    throw new ValidationError('PAYMENT_GATEWAY', 'Could not create payment order');
  }

  booking.razorpayOrderId = order.id;
  await booking.save();

  return res.status(201).json({
    bookingId: String(booking._id),
    orderId: order.id,
    amount: amountPaise,
    currency: CURRENCY,
    breakdown: {
      nights,
      subtotalPaise,
      taxPaise,
      serviceFeePaise,
      amountPaise,
    },
    expiresAt: booking.expiresAt,
  });
});

/* -------------------------------------------------------------------------- */
/* /bookings/verify                                                           */
/* -------------------------------------------------------------------------- */

const verifyBookingPayment = asyncHandler(async (req, res) => {
  const { userId } = req;
  const { bookingId, razorpayOrderId, razorpayPaymentId, razorpaySignature } = req.body || {};

  if (!bookingId || !razorpayOrderId || !razorpayPaymentId || !razorpaySignature) {
    throw new ValidationError('VALIDATION', 'bookingId, razorpayOrderId, razorpayPaymentId, razorpaySignature are required');
  }
  if (!mongoose.Types.ObjectId.isValid(bookingId)) {
    throw new ValidationError('VALIDATION', 'invalid bookingId');
  }

  const booking = await Booking.findById(bookingId);
  if (!booking) throw new NotFoundError('Booking not found');

  // Ownership
  if (String(booking.guestId) !== String(userId)) {
    throw new ValidationError('FORBIDDEN', 'You cannot verify this booking');
  }

  // Order match
  if (booking.razorpayOrderId !== razorpayOrderId) {
    throw new ValidationError('ORDER_BOOKING_MISMATCH', 'Order does not belong to this booking');
  }

  // Idempotency: already confirmed
  if (booking.status === 'confirmed') {
    if (booking.razorpayPaymentId === razorpayPaymentId) {
      return res.status(200).json({ bookingId: String(booking._id), status: 'confirmed', idempotent: true });
    }
    return res.status(409).json({ code: 'ALREADY_CONFIRMED', message: 'Booking already confirmed with a different payment' });
  }

  // Must still be pending
  if (booking.status !== 'pending_payment') {
    throw new ValidationError('BOOKING_NOT_PENDING', `Booking is in state ${booking.status}`);
  }

  // Expired?
  if (booking.expiresAt && new Date() > booking.expiresAt) {
    booking.status = 'expired';
    await booking.save();
    throw new ValidationError('PAYMENT_EXPIRED', 'Payment window expired; create a new order');
  }

  // 1. Signature verification (HMAC of "orderId|paymentId")
  const sigOk = verifyCheckoutSignature({
    orderId: razorpayOrderId,
    paymentId: razorpayPaymentId,
    signature: razorpaySignature,
    secret: getKeySecret(),
  });
  if (!sigOk) {
    throw new ValidationError('SIGNATURE_MISMATCH', 'Payment signature verification failed');
  }

  // 2. Cross-check with Razorpay (defends against replay with someone else's payment)
  let payment;
  try {
    payment = await razorpayService.fetchPayment(razorpayPaymentId);
  } catch (err) {
    apiLogger.error('razorpay.fetchPayment failed', { err: err.message });
    throw new ValidationError('PAYMENT_GATEWAY', 'Could not verify payment with gateway');
  }

  if (payment.order_id !== razorpayOrderId) {
    throw new ValidationError('ORDER_BOOKING_MISMATCH', 'Payment order does not match booking order');
  }
  if (payment.status !== 'captured') {
    throw new ValidationError('PAYMENT_NOT_CAPTURED', `Payment status is ${payment.status}`);
  }
  if (Number(payment.amount) !== Number(booking.amountPaise)) {
    throw new ValidationError('AMOUNT_MISMATCH', 'Payment amount does not match booking amount');
  }

  // 3. Flip to confirmed
  booking.status = 'confirmed';
  booking.razorpayPaymentId = razorpayPaymentId;
  booking.razorpaySignature = razorpaySignature;
  booking.confirmedAt = new Date();
  booking.expiresAt = undefined;
  await booking.save();

  // Mirror onto Payment doc for admin views
  await Payment.findOneAndUpdate(
    { razorpayPaymentId },
    {
      $set: {
        userId,
        bookingId: booking._id,
        amount: booking.amountPaise,
        currency: booking.currency,
        status: 'captured',
        provider: 'razorpay',
        razorpayOrderId,
        razorpayPaymentId,
        razorpaySignature,
        capturedAt: new Date(),
      },
    },
    { upsert: true, new: true },
  );

  return res.status(200).json({ bookingId: String(booking._id), status: 'confirmed' });
});

/* -------------------------------------------------------------------------- */
/* /bookings/:bookingId/cancel                                                */
/* -------------------------------------------------------------------------- */

const cancelBookingByGuest = asyncHandler(async (req, res) => {
  const { userId } = req;
  const { bookingId } = req.params;
  const { reason } = req.body || {};

  if (!mongoose.Types.ObjectId.isValid(bookingId)) {
    throw new ValidationError('VALIDATION', 'invalid bookingId');
  }

  const booking = await Booking.findById(bookingId);
  if (!booking) throw new NotFoundError('Booking not found');
  if (String(booking.guestId) !== String(userId)) {
    throw new ValidationError('FORBIDDEN', 'You cannot cancel this booking');
  }
  if (booking.status !== 'confirmed') {
    throw new ValidationError('NOT_CANCELABLE', `Booking is in state ${booking.status}`);
  }

  // Compute refund per policy
  const refund = refundPolicyService.computeRefund({
    policy: booking.cancellationPolicy,
    checkInDate: booking.checkInDate,
    cancelledAt: new Date(),
    subtotalPaise: booking.subtotalPaise || 0,
    taxPaise: booking.taxPaise || 0,
    serviceFeePaise: booking.serviceFeePaise || 0,
  });

  // Issue refund via Razorpay (if any)
  let refundResponse = null;
  if (refund.totalRefundPaise > 0 && booking.razorpayPaymentId) {
    try {
      refundResponse = await razorpayService.refundPayment({
        paymentId: booking.razorpayPaymentId,
        amountPaise: refund.totalRefundPaise,
        notes: { bookingId: String(booking._id), reason: reason || '' },
        speed: 'normal',
      });
    } catch (err) {
      apiLogger.error('razorpay.refundPayment failed', { err: err.message });
      throw new ValidationError('REFUND_FAILED', 'Refund could not be initiated');
    }
  }

  booking.status = 'cancelled';
  booking.cancelledAt = new Date();
  booking.cancellationReason = reason || '';
  booking.refundAmountPaise = refund.totalRefundPaise;
  booking.refundStatus = refundResponse ? 'initiated' : 'none';
  booking.razorpayRefundId = refundResponse?.id;
  await booking.save();

  // Mirror on Payment.refunds[]
  if (refundResponse) {
    await Payment.findOneAndUpdate(
      { razorpayPaymentId: booking.razorpayPaymentId },
      {
        $inc: { refundedAmount: refund.totalRefundPaise },
        $set: {
          status:
            refund.totalRefundPaise === booking.amountPaise ? 'refunded' : 'partially_refunded',
        },
        $push: {
          refunds: {
            refundId: refundResponse.id,
            amount: refund.totalRefundPaise,
            reason: reason || '',
            status: refundResponse.status || 'initiated',
          },
        },
      },
    );
  }

  return res.status(200).json({
    bookingId: String(booking._id),
    status: 'cancelled',
    refundAmount: refund.totalRefundPaise,
    refundCurrency: booking.currency,
    refundEstimatedDays: '5 to 7 business days',
    breakdown: refund,
  });
});

/* -------------------------------------------------------------------------- */
/* user-facing reads (scoped to caller)                                       */
/* -------------------------------------------------------------------------- */

const getAllBookings = asyncHandler(async (req, res) => {
  const { userId } = req;
  const { status, startDate, endDate } = req.query;
  const { page, limit, skip, sort } = parsePagination(req.query, { sort: '-updatedAt' });

  const filter = { guestId: userId };
  if (status) filter.status = status;
  if (startDate || endDate) {
    filter.createdAt = {};
    if (startDate) filter.createdAt.$gte = new Date(startDate);
    if (endDate) filter.createdAt.$lte = new Date(endDate);
  }

  const [bookings, total] = await Promise.all([
    Booking.find(filter).sort(sort).skip(skip).limit(limit).lean(),
    Booking.countDocuments(filter),
  ]);

  res.status(200).json({
    message: 'Bookings fetched successfully',
    data: bookings,
    pagination: buildPaginationMeta(total, page, limit),
  });
});

const getBookingById = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { userId } = req;
  if (!mongoose.Types.ObjectId.isValid(id)) {
    throw new ValidationError('VALIDATION', 'invalid id');
  }
  const booking = await Booking.findById(id).populate('listingId', 'title imageUrls city');
  if (!booking) throw new NotFoundError('Booking not found');
  if (String(booking.guestId) !== String(userId)) {
    throw new ValidationError('FORBIDDEN', 'Not your booking');
  }
  res.status(200).json({ message: 'Booking fetched successfully', data: booking });
});

const bookingHistory = asyncHandler(async (req, res) => {
  const { userId } = req;
  const todayUtc = dayjs().utc().startOf('day').toDate();

  const upcoming = await Booking.find({
    guestId: userId,
    status: 'confirmed',
    checkInDate: { $gte: todayUtc },
  })
    .populate('listingId', 'title imageUrls')
    .sort({ checkInDate: 1, createdAt: 1 })
    .lean();

  const previous = await Booking.aggregate([
    {
      $match: {
        guestId: new mongoose.Types.ObjectId(userId),
        checkOutDate: { $lt: todayUtc },
        status: { $in: ['confirmed', 'completed', 'cancelled', 'cancelled_by_admin'] },
      },
    },
    {
      $lookup: {
        from: 'listings',
        localField: 'listingId',
        foreignField: '_id',
        as: 'listing',
      },
    },
    { $unwind: '$listing' },
    {
      $lookup: {
        from: 'feedbacks',
        let: { listingId: '$listing._id' },
        pipeline: [
          {
            $match: {
              $expr: {
                $and: [
                  { $eq: ['$listing', '$$listingId'] },
                  { $eq: ['$user', new mongoose.Types.ObjectId(userId)] },
                ],
              },
            },
          },
          { $project: { rating: 1 } },
        ],
        as: 'userFeedback',
      },
    },
    {
      $addFields: {
        userRating: { $ifNull: [{ $arrayElemAt: ['$userFeedback.rating', 0] }, 'N/A'] },
      },
    },
    {
      $project: {
        _id: 1,
        checkInDate: 1,
        checkOutDate: 1,
        listing: {
          _id: 1,
          title: 1,
          imageUrl: { $arrayElemAt: ['$listing.imageUrls', 0] },
        },
        userRating: 1,
      },
    },
  ]);

  res.status(200).json({
    message: 'Booking history fetched successfully',
    count: { upcomingCount: upcoming.length, previousCount: previous.length },
    data: { upcoming, previous },
  });
});

/* -------------------------------------------------------------------------- */
/* legacy update / delete (kept for now; admin uses /admin/bookings)          */
/* -------------------------------------------------------------------------- */

const updateBooking = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { userId } = req;
  if (!mongoose.Types.ObjectId.isValid(id)) {
    throw new ValidationError('VALIDATION', 'invalid id');
  }
  const updated = await bookingService.updateBooking(id, userId, req.body);
  res.status(200).json({ message: 'Booking updated successfully', data: updated });
});

const deleteBooking = asyncHandler(async (req, res) => {
  const { id } = req.params;
  if (!mongoose.Types.ObjectId.isValid(id)) {
    throw new ValidationError('VALIDATION', 'invalid id');
  }
  const booking = await Booking.findByIdAndDelete(id).lean();
  if (!booking) throw new NotFoundError('Booking not found');
  res.status(200).json({ message: 'Booking deleted successfully', data: booking });
});

export {
  createBookingOrder,
  verifyBookingPayment,
  cancelBookingByGuest,
  getAllBookings,
  getBookingById,
  bookingHistory,
  updateBooking,
  deleteBooking,
};
