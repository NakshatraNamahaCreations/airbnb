import express from 'express';
import {
  createOrUpdateInventory,
  checkAvailability,
  getInventories,
  getInventorySummary,
  bulkCreateInventory,
  getInventoryCalendar,
} from '../controllers/inventory.controller.js';
import { authenticate } from '../middlewares/authMiddleware.js';

const router = express.Router();

// Apply authentication to all inventory routes
router.use(authenticate);

// Basic inventory operations
router.post('/', createOrUpdateInventory);
router.post('/bulk', bulkCreateInventory);

// Availability and queries
router.get('/', getInventories);
router.get('/availability', checkAvailability);
router.get('/summary/:listingId', getInventorySummary);
router.get('/calendar/:listingId', getInventoryCalendar);

export default router;
