import Inventory from '../models/inventory.model.js';
import { NotFoundError, ConflictError } from '../utils/error.js';
import { apiLogger } from '../utils/logger.js';
import mongoose from 'mongoose';

/**
 * Admin/setup: create or update an available window (single-unit)
 */
const createOrUpdateInventory = async(listingId, checkInDate, checkOutDate, _ignored, notes = '') => {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    let inventory = await Inventory.findOne({ listingId, checkInDate, checkOutDate }).session(session);

    if (inventory) {
      inventory.notes = notes;
      await inventory.save({ session });
      apiLogger.info('Inventory window updated', { listingId, checkInDate, checkOutDate });
    } else {
      inventory = await Inventory.create([
        { listingId, checkInDate, checkOutDate, status: 'available', notes },
      ], { session });
      inventory = inventory[0];
      apiLogger.info('Inventory window created', { listingId, checkInDate, checkOutDate });
    }

    await session.commitTransaction();
    return inventory;
  } catch (error) {
    await session.abortTransaction();
    apiLogger.error('Error creating/updating inventory', { error: error.message, listingId });
    throw error;
  } finally {
    session.endSession();
  }
};

/**
 * Availability: true if no blocking overlap (fully_booked, blocked, maintenance)
 */
const checkAvailability = async(listingId, checkInDate, checkOutDate) => {
  const blocking = await Inventory.find({
    listingId,
    status: { $in: ['fully_booked', 'blocked', 'maintenance'] },
    checkInDate: { $lt: checkOutDate },
    checkOutDate: { $gt: checkInDate },
  });
  console.log('blockiing: ', blocking);
  return { available: blocking.length === 0, overlapping: blocking };
};

/**
 * Create booking window (fully_booked) if dates are free
 */
const createBookingWindow = async(listingId, checkInDate, checkOutDate, enquiryId, guestId) => {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const { available } = await checkAvailability(listingId, checkInDate, checkOutDate);
    if (!available) {
      throw new ConflictError('Dates are not available');
    }

    let booking = await Inventory.create([
      { listingId, checkInDate, checkOutDate, status: 'fully_booked', enquiryId, guestId },
    ], { session });
    booking = booking[0];

    await session.commitTransaction();
    apiLogger.info('Booking window created', { listingId, checkInDate, checkOutDate, enquiryId });
    return booking;
  } catch (error) {
    await session.abortTransaction();
    apiLogger.error('Error creating booking window', { error: error.message, listingId });
    throw error;
  } finally {
    session.endSession();
  }
};

/**
 * Delete booking window for enquiry (release)
 */
const deleteBookingWindow = async(listingId, checkInDate, checkOutDate, enquiryId) => {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const existing = await Inventory.findOne({
      listingId,
      checkInDate,
      checkOutDate,
      enquiryId,
      status: 'fully_booked',
    }).session(session);

    if (!existing) {
      throw new NotFoundError('Booking window not found');
    }

    await Inventory.deleteOne({ _id: existing._id }).session(session);
    await session.commitTransaction();

    apiLogger.info('Booking window deleted', { listingId, checkInDate, checkOutDate, enquiryId });
    return { success: true };
  } catch (error) {
    await session.abortTransaction();
    apiLogger.error('Error deleting booking window', { error: error.message, listingId });
    throw error;
  } finally {
    session.endSession();
  }
};

/**
 * Summary for calendar
 */
const getInventorySummary = async(listingId, startDate, endDate) => {
  const query = { listingId };
  if (startDate && endDate) {
    query.checkInDate = { $gte: new Date(startDate) };
    query.checkOutDate = { $lte: new Date(endDate) };
  }
  const inventory = await Inventory.find(query).sort({ checkInDate: 1 });
  return {
    listingId,
    totalRecords: inventory.length,
    summary: inventory.map((inv) => ({
      checkInDate: inv.checkInDate,
      checkOutDate: inv.checkOutDate,
      status: inv.status,
      enquiryId: inv.enquiryId,
    })),
  };
};

export default {
  createOrUpdateInventory,
  checkAvailability,
  createBookingWindow,
  deleteBookingWindow,
  getInventorySummary,
};
