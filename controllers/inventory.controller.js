import asyncHandler from '../middlewares/asynchandler.js';
import InventoryService from '../services/inventory.service.js';
import { apiLogger } from '../utils/logger.js';
import { ValidationError } from '../utils/error.js';
import Inventory from '../models/inventory.model.js';

/**
 * Create or update inventory for a listing
 */
const createOrUpdateInventory = asyncHandler(async(req, res) => {
  const { listingId, checkInDate, checkOutDate, totalUnits, notes } = req.body;

  // Validate required fields
  if (!listingId || !checkInDate || !checkOutDate || !totalUnits) {
    throw new ValidationError('MISSING_REQUIRED_FIELDS', 'listingId, checkInDate, checkOutDate, and totalUnits are required');
  }

  // Validate dates
  if (new Date(checkInDate) >= new Date(checkOutDate)) {
    throw new ValidationError('INVALID_DATES', 'checkInDate must be before checkOutDate');
  }

  // Validate total units
  if (totalUnits < 1) {
    throw new ValidationError('INVALID_UNITS', 'totalUnits must be at least 1');
  }

  const inventory = await InventoryService.createOrUpdateInventory(
    listingId,
    new Date(checkInDate),
    new Date(checkOutDate),
    totalUnits,
    notes || '',
  );

  apiLogger.info('Inventory created/updated successfully', { listingId, checkInDate, checkOutDate });

  res.status(200).json({
    message: 'Inventory created/updated successfully',
    data: inventory,
  });
});

/**
 * Check availability for a specific date range
 */
const checkAvailability = asyncHandler(async(req, res) => {
  const { listingId, checkInDate, checkOutDate, requiredUnits = 1 } = req.query;

  // Validate required fields
  if (!listingId || !checkInDate || !checkOutDate) {
    throw new ValidationError('MISSING_REQUIRED_FIELDS', 'listingId, checkInDate, and checkOutDate are required');
  }

  // Validate dates
  if (new Date(checkInDate) >= new Date(checkOutDate)) {
    throw new ValidationError('INVALID_DATES', 'checkInDate must be before checkOutDate');
  }

  const availability = await InventoryService.checkAvailability(
    listingId,
    new Date(checkInDate),
    new Date(checkOutDate),
    parseInt(requiredUnits),
  );

  res.status(200).json({
    message: 'Availability checked successfully',
    data: availability,
  });
});

const getInventories = asyncHandler(async(req, res) => {
  const { listingId } = req.params;
  const inventories = await Inventory.find();

  res.status(200).json({
    message: 'Inventories retrieved successfully',
    data: inventories,
  });
});

/**
 * Get inventory summary for a listing
 */
const getInventorySummary = asyncHandler(async(req, res) => {
  const { listingId } = req.params;
  const { startDate, endDate } = req.query;

  if (!listingId) {
    throw new ValidationError('MISSING_REQUIRED_FIELDS', 'listingId is required');
  }

  const summary = await InventoryService.getInventorySummary(
    listingId,
    startDate ? new Date(startDate) : null,
    endDate ? new Date(endDate) : null,
  );

  res.status(200).json({
    message: 'Inventory summary retrieved successfully',
    data: summary,
  });
});

/**
 * Bulk create inventory for multiple date ranges
 */
const bulkCreateInventory = asyncHandler(async(req, res) => {
  const { listingId, inventoryRanges } = req.body;

  if (!listingId || !inventoryRanges || !Array.isArray(inventoryRanges)) {
    throw new ValidationError('MISSING_REQUIRED_FIELDS', 'listingId and inventoryRanges array are required');
  }

  const results = [];
  const errors = [];

  for (const range of inventoryRanges) {
    try {
      const { checkInDate, checkOutDate, totalUnits, notes } = range;

      if (!checkInDate || !checkOutDate || !totalUnits) {
        errors.push({ range, error: 'Missing required fields' });
        continue;
      }

      const inventory = await InventoryService.createOrUpdateInventory(
        listingId,
        new Date(checkInDate),
        new Date(checkOutDate),
        totalUnits,
        notes || '',
      );

      results.push(inventory);
    } catch (error) {
      errors.push({ range, error: error.message });
    }
  }

  apiLogger.info('Bulk inventory creation completed', {
    listingId,
    successful: results.length,
    errors: errors.length,
  });

  res.status(200).json({
    message: 'Bulk inventory creation completed',
    data: {
      successful: results.length,
      errors: errors.length,
      results,
      errors: errors.length > 0 ? errors : undefined,
    },
  });
});

/**
 * Get inventory calendar view for a listing
 */
const getInventoryCalendar = asyncHandler(async(req, res) => {
  const { listingId } = req.params;
  const { year, month } = req.query;

  if (!listingId) {
    throw new ValidationError('MISSING_REQUIRED_FIELDS', 'listingId is required');
  }

  // Default to current month if not specified
  const currentYear = year ? parseInt(year) : new Date().getFullYear();
  const currentMonth = month ? parseInt(month) : new Date().getMonth() + 1;

  const startDate = new Date(currentYear, currentMonth - 1, 1);
  const endDate = new Date(currentYear, currentMonth, 0);

  const summary = await InventoryService.getInventorySummary(
    listingId,
    startDate,
    endDate,
  );

  // Format data for calendar view
  const calendarData = {
    year: currentYear,
    month: currentMonth,
    listingId,
    days: [],
  };

  // Generate calendar days
  const daysInMonth = new Date(currentYear, currentMonth, 0).getDate();
  for (let day = 1; day <= daysInMonth; day++) {
    const date = new Date(currentYear, currentMonth - 1, day);
    const dayData = {
      date: date.toISOString().split('T')[0],
      day,
      inventory: null,
    };

    // Find inventory for this date
    const dayInventory = summary.summary.find((inv) => {
      const invStart = new Date(inv.checkInDate);
      const invEnd = new Date(inv.checkOutDate);
      return date >= invStart && date < invEnd;
    });

    if (dayInventory) {
      dayData.inventory = {
        totalUnits: dayInventory.totalUnits,
        reservedUnits: dayInventory.reservedUnits,
        availableUnits: dayInventory.availableUnits,
        status: dayInventory.status,
      };
    }

    calendarData.days.push(dayData);
  }

  res.status(200).json({
    message: 'Inventory calendar retrieved successfully',
    data: calendarData,
  });
});

export {
  createOrUpdateInventory,
  checkAvailability,
  getInventories,
  getInventorySummary,
  bulkCreateInventory,
  getInventoryCalendar,
};
