import asyncHandler from '../middlewares/asynchandler.js';
import Enquiry from '../models/enquiry.model.js';
import { apiLogger } from '../utils/logger.js';
import mongoose from 'mongoose';
import { NotFoundError, ValidationError } from '../utils/error.js';
import InventoryService from '../services/inventory.service.js';
import paymentService from '../services/payment.service.js';

/*
* dont allow guests less than 1
*/
const createEnquiry = async(req, res) => {
  console.log('createEnquiry executed ');

  const session = await mongoose.startSession();
  session.startTransaction();
  try{

    const { userId } = req;
    const { listingId, checkInDate, checkOutDate, guests, message } = req.body;

    // For single-unit: just ensure dates are available now (optional early check)
    const availability = await InventoryService.checkAvailability(
      listingId,
      new Date(checkInDate),
      new Date(checkOutDate),
    );

    if (!availability.available) {
      throw new ValidationError('DATES_UNAVAILABLE', 'Selected dates are not available');
    }

    // payment
    const amount = Math.floor(Math.random() * 1000);
    const payment = await paymentService.createPayment(userId, amount, session);

    // enquiry
    const enquiry = await Enquiry.create(
      [{
        listingId,
        guestId: userId,
        checkInDate: new Date(checkInDate),
        checkOutDate: new Date(checkOutDate),
        guests,
        message,
        status: 'accepted',
      }],
      { session },
    );


    console.log('Enquiry created successfully', { enquiry, payment });

    await session.commitTransaction();

    return res.status(201).json({ message: 'Enquiry created successfully', data: enquiry });
  } catch (error) {
    await session.abortTransaction();
    console.log('Failed to create enquiry', { error: error.message });
    throw error;
  } finally {
    session.endSession();
  }
};

const getAllEnquiries = asyncHandler(async(req, res) => {
  console.log('getAll enquires ');
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

  const enquiries = await Enquiry.find(filter).sort({ updatedAt: -1 });

  res.status(200).json({ message: 'Enquiries fetched successfully', data: enquiries });
});

const acceptEnquiry = asyncHandler(async(req, res) => {
  console.log('accept enquiry ', req.params);
  const { id } = req.params;
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    if (!mongoose.Types.ObjectId.isValid(id)) {
      throw new NotFoundError('Invalid enquiry ID');
    }

    const enquiry = await Enquiry.findById(id).session(session);
    if (!enquiry) {
      throw new NotFoundError('Enquiry not found');
    }

    if (enquiry.status !== 'pending') {
      throw new ValidationError('ENQUIRY_ALREADY_PROCESSED', 'Enquiry has already been processed');
    }

    // Single-unit: create booking window for exact dates
    await InventoryService.createBookingWindow(
      enquiry.listingId,
      enquiry.checkInDate,
      enquiry.checkOutDate,
      enquiry._id,
      enquiry.guestId,
    );

    enquiry.status = 'accepted';
    await enquiry.save({ session });

    await session.commitTransaction();

    apiLogger.info('Enquiry accepted and booking window created', {
      enquiryId: id,
      status: enquiry.status,
    });

    res.status(200).json({
      message: 'Enquiry accepted successfully',
      data: enquiry,
    });
  } catch (error) {
    await session.abortTransaction();
    apiLogger.error('Failed to accept enquiry', {
      enquiryId: id,
      error: error.message,
    });
    throw error;
  } finally {
    session.endSession();
  }
});

const rejectEnquiry = asyncHandler(async(req, res) => {
  const { id } = req.params;
  const { reason } = req.body; // Optional reason for rejection
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    if (!mongoose.Types.ObjectId.isValid(id)) {
      throw new NotFoundError('Invalid enquiry ID');
    }

    const enquiry = await Enquiry.findById(id).session(session);
    if (!enquiry) {
      throw new NotFoundError('Enquiry not found');
    }

    if (enquiry.status !== 'pending') {
      throw new ValidationError('ENQUIRY_ALREADY_PROCESSED', 'Enquiry has already been processed');
    }

    enquiry.status = 'rejected';
    if (reason) {
      enquiry.rejectionReason = reason;
    }
    await enquiry.save({ session });

    await session.commitTransaction();

    apiLogger.info('Enquiry rejected successfully', { enquiryId: id, status: enquiry.status, reason });

    res.status(200).json({
      message: 'Enquiry rejected successfully',
      data: enquiry,
    });
  } catch (error) {
    await session.abortTransaction();
    apiLogger.error('Failed to reject enquiry', { enquiryId: id, error: error.message });
    throw error;
  } finally {
    session.endSession();
  }
});

const getEnquiryById = asyncHandler(async(req, res) => {
  const { id } = req.params;
  if (!mongoose.Types.ObjectId.isValid(id)) {
    throw new NotFoundError('Invalid ID');
  }
  const enquiry = await Enquiry.findById(id);

  if (!enquiry) {
    throw new NotFoundError('Enquiry not found');
  }

  res.status(200).json({ message: 'Enquiry fetched successfully', data: enquiry });
});

const updateEnquiry = asyncHandler(async(req, res) => {
  const { id } = req.params;

  if (!mongoose.Types.ObjectId.isValid(id)) {
    throw new NotFoundError('Invalid ID');
  }

  const enquiry = await Enquiry.findByIdAndUpdate(id, req.body, { new: true });

  if (!enquiry) {
    throw new NotFoundError('Enquiry not found');
  }

  res.status(200).json({ message: 'Enquiry updated successfully', data: enquiry });
});

const deleteEnquiry = asyncHandler(async(req, res) => {
  const { id } = req.params;
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    if (!mongoose.Types.ObjectId.isValid(id)) {
      throw new NotFoundError('Invalid ID');
    }

    const enquiry = await Enquiry.findById(id).session(session);

    if (!enquiry) {
      throw new NotFoundError('Enquiry not found');
    }

    // If accepted, delete the booking window
    if (enquiry.status === 'accepted') {
      try {
        await InventoryService.deleteBookingWindow(
          enquiry.listingId,
          enquiry.checkInDate,
          enquiry.checkOutDate,
          enquiry._id,
        );
      } catch (error) {
        apiLogger.warn('Failed to delete booking window during enquiry deletion', {
          enquiryId: id,
          error: error.message,
        });
      }
    }

    await Enquiry.findByIdAndDelete(id).session(session);

    await session.commitTransaction();

    res.status(200).json({ message: 'Enquiry deleted successfully', data: enquiry });
  } catch (error) {
    await session.abortTransaction();
    apiLogger.error('Failed to delete enquiry', { enquiryId: id, error: error.message });
    throw error;
  } finally {
    session.endSession();
  }
});

export {
  createEnquiry,
  getAllEnquiries,
  getEnquiryById,
  updateEnquiry,
  deleteEnquiry,
  acceptEnquiry,
  rejectEnquiry,
};
