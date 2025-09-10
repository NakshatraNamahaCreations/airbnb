import mongoose from 'mongoose';
import asyncHandler from '../middlewares/asynchandler.js';
import { apiLogger } from '../utils/logger.js';
import { NotFoundError, ValidationError } from '../utils/error.js';
import Booking from '../models/booking.model.js';
import bookingService from '../services/booking.service.js';
import paymentService from '../services/payment.service.js';
import Listing from '../models/listing.model.js';
import dayjs from 'dayjs';
import isSameOrAfter from 'dayjs/plugin/isSameOrAfter.js';   // <-- import it
import isSameOrBefore from 'dayjs/plugin/isSameOrBefore.js'; // optional
import utc from 'dayjs/plugin/utc.js';
dayjs.extend(utc);


/*
* dont allow guests less than 1
*/
const createBooking = async(req, res) => {
  console.log('createBooking executed');

  const session = await mongoose.startSession();
  session.startTransaction();

  try {

    const { userId } = req;
    const { listingId, checkInDate, checkOutDate, guests, message } = req.body;

    console.log('type of checkInDate ', typeof checkInDate);
    console.log('type of checkOutDate ', typeof checkOutDate);

    const formattedCheckInDate = dayjs(checkInDate, 'YYYY-MM-DD').format('YYYY-MM-DD');
    const formattedCheckOutDate = dayjs(checkOutDate, 'YYYY-MM-DD').format('YYYY-MM-DD');
    console.log('formattedCheckInDate: ', formattedCheckInDate, 'checkin: ', checkInDate);
    console.log('formattedCheckOutDate: ', formattedCheckOutDate, 'checkout: ', checkOutDate);

    if (new Date(formattedCheckOutDate) < new Date(formattedCheckInDate)) {
      throw new ValidationError('INVALID_DATES', 'Check-out date must be after check-in date');
    }

    // Fetch the listing document
    const listing = await Listing.findById(listingId);
    if (!listing) {
      throw new NotFoundError('Listing not found');
    }

    // Validate guests against listing capacity
    const { adults = 0, children = 0, infants = 0, pets = 0 } = guests || {};
    const totalGuests = adults + children;
    if (totalGuests > listing.maxGuests) {
      throw new ValidationError('CAPACITY_EXCEEDED', `Total guests (${totalGuests}) exceed max allowed (${listing.maxGuests})`);
    }
    if (adults > listing.capacity.adults) {
      throw new ValidationError('ADULTS_EXCEEDED', `Adults (${adults}) exceed max allowed (${listing.capacity.adults})`);
    }
    if (children > listing.capacity.children) {
      throw new ValidationError('CHILDREN_EXCEEDED', `Children (${children}) exceed max allowed (${listing.capacity.children})`);
    }
    if (infants > listing.capacity.infants) {
      throw new ValidationError('INFANTS_EXCEEDED', `Infants (${infants}) exceed max allowed (${listing.capacity.infants})`);
    }
    if (pets > listing.capacity.pets) {
      throw new ValidationError('PETS_EXCEEDED', `Pets (${pets}) exceed max allowed (${listing.capacity.pets})`);
    }

    // For single-unit: just ensure dates are available now (optional early check)
    const availability = await bookingService.checkAvailability(
      listingId,
      new Date(formattedCheckInDate),
      new Date(formattedCheckOutDate),
    );

    if (!availability.available) {
      throw new ValidationError('DATES_UNAVAILABLE', 'Selected dates are not available');
    }

    // payment
    const amount = Math.floor(Math.random() * 1000);
    const payment = await paymentService.createPayment(userId, amount, session);

    // booking
    const booking = await Booking.create(
      [{
        listingId,
        guestId: userId,
        checkInDate: new Date(formattedCheckInDate),
        checkOutDate: new Date(formattedCheckOutDate),
        guests,
        message,
        status: 'accepted',
      }],
      { session },
    );


    console.log('Booking created successfully', { booking, payment });

    await session.commitTransaction();

    return res.status(201).json({ message: 'Booking created successfully', data: booking });
  } catch (error) {
    await session.abortTransaction();
    console.log('Failed to create booking', { error: error.message });
    throw error;
  } finally {
    session.endSession();
  }
};

const getAllBookings = asyncHandler(async(req, res) => {
  console.log('getAll bookings ');
  const { status, assignedTo, startDate, endDate } = req.query;

  // Build dynamic filter object
  const filter = {};
  if (status) filter.status = status;
  if (assignedTo) filter.assignedTo = assignedTo;
  if (startDate || endDate) {
    filter.createdAt = {};
    if (startDate) filter.createdAt.$gte = new Date(startDate);
    if (endDate) filter.createdAt.$lte = new Date(endDate);
  }

  const bookings = await Booking.find(filter).sort({ updatedAt: -1 }).lean();

  console.log('bookigs ', bookings);

  // bookings.map((booking) => {
  //   booking.checkInDate = dayjs(booking.checkInDate).format('YYYY-MM-DD');
  //   booking.checkOutDate = dayjs(booking.checkOutDate).format('YYYY-MM-DD');
  // });

  // const formattedBookings = bookings.map((booking) => ({
  //   checkInDate: booking.checkInDate,
  //   checkOutDate: booking.checkOutDate,
  // }));

  // console.log('after formatted bookigs: ', formattedBookings);

  res.status(200).json({
    message: 'Bookings fetched successfully',
    data: bookings,
  });
});

const acceptBooking = asyncHandler(async(req, res) => {
  console.log('accept booking ', req.params);
  const { id } = req.params;
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    if (!mongoose.Types.ObjectId.isValid(id)) {
      throw new NotFoundError('Invalid booking ID');
    }

    const booking = await Booking.findById(id).session(session);
    if (!booking) {
      throw new NotFoundError('Booking not found');
    }

    if (booking.status !== 'pending') {
      throw new ValidationError('BOOKING_ALREADY_PROCESSED', 'Booking has already been processed');
    }

    // Single-unit: create booking window for exact dates
    await bookingService.createBookingWindow(
      booking.listingId,
      booking.checkInDate,
      booking.checkOutDate,
    );

    booking.status = 'accepted';
    await booking.save({ session });


    await session.commitTransaction();

    apiLogger.info('Booking accepted and booking window created', {
      bookingId: id,
      status: booking.status,
    });

    res.status(200).json({
      message: 'Booking accepted successfully',
      data: booking,
    });
  } catch (error) {
    await session.abortTransaction();
    apiLogger.error('Failed to accept booking', {
      bookingId: id,
      error: error.message,
    });
    throw error;
  } finally {
    session.endSession();
  }
});

const rejectBooking = asyncHandler(async(req, res) => {
  const { id } = req.params;
  const { reason } = req.body; // Optional reason for rejection
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    if (!mongoose.Types.ObjectId.isValid(id)) {
      throw new NotFoundError('Invalid booking ID');
    }

    const booking = await Booking.findById(id).session(session);
    if (!booking) {
      throw new NotFoundError('Booking not found');
    }

    if (booking.status !== 'pending') {
      throw new ValidationError('BOOKING_ALREADY_PROCESSED', 'Booking has already been processed');
    }

    booking.status = 'rejected';
    if (reason) {
      booking.rejectionReason = reason;
    }
    await booking.save({ session });

    await session.commitTransaction();

    apiLogger.info('Booking rejected successfully', { bookingId: id, status: booking.status, reason });

    res.status(200).json({
      message: 'Booking rejected successfully',
      data: booking,
    });
  } catch (error) {
    await session.abortTransaction();
    apiLogger.error('Failed to reject booking', { bookingId: id, error: error.message });
    throw error;
  } finally {
    session.endSession();
  }
});

const getBookingById = asyncHandler(async(req, res) => {
  const { id } = req.params;
  if (!mongoose.Types.ObjectId.isValid(id)) {
    throw new NotFoundError('Invalid ID');
  }
  const booking = await Booking.findById(id);

  if (!booking) {
    throw new NotFoundError('Booking not found');
  }

  res.status(200).json({ message: 'Booking fetched successfully', data: booking });
});

const updateBooking = asyncHandler(async(req, res) => {
  const { id } = req.params;
  const { userId } = req;
  const { listingId, guestId, checkInDate, checkOutDate, message, status, guests } = req.body;


  if (!mongoose.Types.ObjectId.isValid(id)) {
    throw new NotFoundError('Invalid ID');
  }

  // const booking = await Booking.findByIdAndUpdate(
  //   id,
  //   { listingId, guestId, checkInDate, checkOutDate, message, status, guests },
  //   { new: true },
  // );

  // if (!booking) {
  //   throw new NotFoundError('Booking not found');
  // }

  const updatedBooking = await bookingService.updateBooking(id, userId, req.body);

  res.status(200).json({ message: 'Booking updated successfully', data: updatedBooking });
});

const deleteBooking = asyncHandler(async(req, res) => {
  const { id } = req.params;
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    if (!mongoose.Types.ObjectId.isValid(id)) {
      throw new NotFoundError('Invalid ID');
    }

    const booking = await Booking.findById(id).session(session);

    if (!booking) {
      throw new NotFoundError('Booking not found');
    }

    // If accepted, delete the booking window
    if (booking.status === 'accepted') {
      try {
        await bookingService.deleteBookingWindow(
          booking.listingId,
          booking.checkInDate,
          booking.checkOutDate,
          booking._id,
        );
      } catch (error) {
        apiLogger.warn('Failed to delete booking window during booking deletion', {
          bookingId: id,
          error: error.message,
        });
      }
    }

    await Booking.findByIdAndDelete(id).session(session);

    await session.commitTransaction();

    res.status(200).json({ message: 'Booking deleted successfully', data: booking });
  } catch (error) {
    await session.abortTransaction();
    apiLogger.error('Failed to delete booking', { bookingId: id, error: error.message });
    throw error;
  } finally {
    session.endSession();
  }
});

const bookingHistory = asyncHandler(async(req, res) => {
  const { userId } = req;

  const bookings = await Booking.find({ guestId: userId }).sort({ checkInDate: -1 });


  dayjs.extend(isSameOrAfter);

  // const today = dayjs().startOf('day');

  // const upcoming = bookings.filter((b) => dayjs(b.checkInDate).isSameOrAfter(today, 'day'));
  // const previous = bookings.filter((b) => dayjs(b.checkInDate).isBefore(today, 'day'));


  const todayUtc = dayjs().utc().startOf('day').toDate();
  console.log('todayUtc: ', todayUtc);

  // Upcoming = checkInDate >= today
  const upcoming = await Booking.find({ guestId: userId, checkInDate: { $gte: todayUtc } }).lean();

  // previous = checkOutDate < today
  const previous = await Booking.find({ guestId: userId, checkOutDate: { $lt: todayUtc } }).lean();


  res.status(200).json({
    message: 'Booking history fetched successfully',
    meta: {
      count: bookings.length,
      upcomingCount: upcoming.length,
      previousCount: previous.length,
    },
    data: {
      upcoming,
      previous,
    },
  });
});

export {
  createBooking,
  getAllBookings,
  getBookingById,
  updateBooking,
  deleteBooking,
  acceptBooking,
  rejectBooking,
  bookingHistory,
};
