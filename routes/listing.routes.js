import express from 'express';
import {
  registerListing,
  recentlyViewed,
  getAllListings,
  getMyListings,
  getListing,
  getNearbyListings,
  updateListing,
  deleteListing,
  searchListings,
} from '../controllers/listing.controller.js';
import { authenticate, authenticateAdmin } from '../middlewares/authMiddleware.js';

const router = express.Router();

// Admin-only mutations
router.post('/', authenticateAdmin, registerListing);
router.patch('/:id', authenticateAdmin, updateListing);
router.delete('/:id', authenticateAdmin, deleteListing);

// User-facing reads
router.get('/', authenticate, getAllListings);
router.get('/me', authenticate, getMyListings);
router.get('/nearby', authenticate, getNearbyListings);
router.post('/search', authenticate, searchListings);
router.get('/recently-viewed', authenticate, recentlyViewed);
router.get('/:id', authenticate, getListing);

export default router;
