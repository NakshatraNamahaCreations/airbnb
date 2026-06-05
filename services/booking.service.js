import Booking from '../models/booking.model.js';
import Listing from '../models/listing.model.js';
import { NotFoundError, ConflictError, ValidationError } from '../utils/error.js';
import { apiLogger } from '../utils/logger.js';
import mongoose from 'mongoose';

/**
 * Check availability: true if no accepted booking overlaps the requested range
 */
const BLOCKING_STATUSES = ['confirmed', 'pending_payment', 'accepted'];

const checkAvailability = async(listingId, checkInDate, checkOutDate) => {
  const overlapping = await Booking.find({
    listingId,
    status: { $in: BLOCKING_STATUSES },
    checkInDate: { $lt: checkOutDate },
    checkOutDate: { $gt: checkInDate },
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

// export default {
//   checkAvailability,
//   createBookingWindow,
//   deleteBookingWindow,
//   getBookingSummary,
// };




/**
 * Create a new booking
 */
const createBooking = async({ guestId, listingId, guests, checkInDate, checkOutDate, message }) => {
  // Ensure listing exists
  const listing = await Listing.findById(listingId);
  if (!listing) throw new NotFoundError('Listing not found');

  // Capacity check
  const total = guests.adults + guests.children;
  if (total > listing.maxGuests) {
    throw new ValidationError(
      'CAPACITY_EXCEEDED',
      `Total guests (${total}) exceed max allowed (${listing.maxGuests})`,
    );
  }

  // Date validation
  if (new Date(checkInDate) >= new Date(checkOutDate)) {
    throw new ValidationError('INVALID_DATES', 'Check-in must be before check-out');
  }

  const booking = new Booking({
    guestId,
    listingId,
    guests,
    checkInDate,
    checkOutDate,
    message,
    status: 'pending',
  });

  await booking.save();
  return booking;
};


const checkAvailabilityForUpdate = async(listingId, checkInDate, checkOutDate, bookingId) => {
  const overlapping = await Booking.find({
    listingId,
    _id: { $ne: bookingId },
    status: { $in: BLOCKING_STATUSES },
    checkInDate: { $lt: checkOutDate },
    checkOutDate: { $gt: checkInDate },
  }).lean();

  console.log('overlapping: ', overlapping);

  return { available: overlapping.length === 0, overlapping };
};

/**
 * Update an existing booking
 */
const updateBooking = async(bookingId, userId, updates) => {
  // console.log(`inside  updateBooking`, bookingId, userId, updates);


  const booking = await Booking.findById(bookingId);
  if (!booking) throw new NotFoundError('Booking not found');

  // Check ownership (or extend with roles/permissions)
  if (booking.guestId.toString() !== userId.toString()) {
    throw new ValidationError('FORBIDDEN', 'You cannot update this booking');
  }

  const { available } = await checkAvailabilityForUpdate(booking.listingId, updates.checkInDate, updates.checkOutDate, bookingId);
  console.log('available: ', available);
  if (!available) throw new ConflictError('Dates are not available');

  // Guests update → check against listing limits
  // adults + children share maxGuests; infants and pets have their own caps.
  if (updates.guests) {
    const listing = await Listing.findById(booking.listingId);
    const adults = updates.guests.adults || 0;
    const children = updates.guests.children || 0;
    const infants = updates.guests.infants || 0;
    const pets = updates.guests.pets || 0;
    const total = adults + children;

    if (adults < 1) {
      throw new ValidationError('ADULT_REQUIRED', 'At least one adult is required');
    }
    if (total > listing.maxGuests) {
      throw new ValidationError(
        'CAPACITY_EXCEEDED',
        `Total guests (${total}) exceed max allowed (${listing.maxGuests})`,
      );
    }
    if (infants > (listing.maxInfants || 0)) {
      throw new ValidationError('INFANTS_EXCEEDED', `Infants (${infants}) exceed max allowed (${listing.maxInfants || 0})`);
    }
    if (pets > (listing.maxPets || 0)) {
      throw new ValidationError('PETS_EXCEEDED', `Pets (${pets}) exceed max allowed (${listing.maxPets || 0})`);
    }
    booking.guests = updates.guests;
  }

  // Dates update → validate order
  if (updates.checkInDate && updates.checkOutDate) {
    if (new Date(updates.checkInDate) >= new Date(updates.checkOutDate)) {
      throw new ValidationError('INVALID_DATES', 'Check-in must be before check-out');
    }
    booking.checkInDate = updates.checkInDate;
    booking.checkOutDate = updates.checkOutDate;
  }

  // Status update
  if (updates.status) {
    booking.status = updates.status;
  }

  // Message update
  if (updates.message) {
    booking.message = updates.message;
  }

  await booking.save();
  return booking;
};


/**
 * Cancel booking
 */
const cancelBooking = async(bookingId, userId) => {
  const booking = await Booking.findById(bookingId);
  if (!booking) throw new NotFoundError('Booking not found');

  // Only owner or admin can cancel
  if (booking.guestId.toString() !== userId.toString()) {
    throw new ValidationError('FORBIDDEN', 'You cannot cancel this booking');
  }

  booking.status = 'cancelled';
  await booking.save();
  return booking;
};

/**
 * Fetch bookings for a guest
 */
const getBookingsByGuest = (guestId) => {
  return Booking.find({ guestId }).populate('listingId');
};

/**
 * Fetch bookings for a listing (host view)
 */
const getBookingsForListing = (listingId) => {
  return Booking.find({ listingId }).populate('guestId');
};

export default {
  checkAvailability,
  createBookingWindow,
  deleteBookingWindow,
  getBookingSummary,
  updateBooking,
  cancelBooking,
  getBookingsByGuest,
  getBookingsForListing,
};
