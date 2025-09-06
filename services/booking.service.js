import Booking from '../models/booking.model.js';
import { NotFoundError, ConflictError } from '../utils/error.js';
import { apiLogger } from '../utils/logger.js';
import mongoose from 'mongoose';

/**
 * Check availability: true if no accepted booking overlaps the requested range
 */
const checkAvailability = async(listingId, checkInDate, checkOutDate) => {
  const overlapping = await Booking.find({
    listingId,
    status: 'accepted',
    checkInDate: { $lte: checkOutDate },
    checkOutDate: { $gte: checkInDate },
  });

  return { available: overlapping.length === 0, overlapping };
};

/**
 * (No-op) Create booking window: just check availability, don't create anything extra
 */
const createBookingWindow = async(listingId, checkInDate, checkOutDate) => {
  const { available } = await checkAvailability(listingId, checkInDate, checkOutDate);
  if (!available) throw new ConflictError('Dates are not available');
  // No window to create, booking itself is the window
  return { success: true };
};

/**
 * (No-op) Delete booking window: nothing to delete, just for API compatibility
 */
const deleteBookingWindow = async(listingId, checkInDate, checkOutDate, bookingId) => {
  // No-op, just return success
  return { success: true };
};

/**
 * Get booking summary for calendar
 */
const getBookingSummary = async(listingId, startDate, endDate) => {
  const query = { listingId };
  if (startDate && endDate) {
    query.checkInDate = { $gte: new Date(startDate) };
    query.checkOutDate = { $lte: new Date(endDate) };
  }
  const bookings = await Booking.find(query).sort({ checkInDate: 1 });
  return {
    listingId,
    totalRecords: bookings.length,
    summary: bookings.map((b) => ({
      checkInDate: b.checkInDate,
      checkOutDate: b.checkOutDate,
      status: b.status,
      bookingId: b._id,
    })),
  };
};

export default {
  checkAvailability,
  createBookingWindow,
  deleteBookingWindow,
  getBookingSummary,
};
