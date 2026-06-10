import express from 'express';
import {
  registerListing,
  recentlyViewed,
  getAllListings,
  getMyListings,
  createMyListing,
  updateMyListing,
  deleteMyListing,
  getListing,
  getNearbyListings,
  updateListing,
  deleteListing,
  searchListings,
} from '../controllers/listing.controller.js';
import { authenticate, authenticateAdmin, authorizeRoles } from '../middlewares/authMiddleware.js';

const router = express.Router();

// Host self-serve (own listings). Declared BEFORE the admin/user `/:id` routes
// so the literal `/me` segment is never captured as an :id.
router.get('/me', authenticate, getMyListings);
router.post('/me', authenticate, authorizeRoles('host'), createMyListing);
router.patch('/me/:id', authenticate, authorizeRoles('host'), updateMyListing);
router.delete('/me/:id', authenticate, authorizeRoles('host'), deleteMyListing);

// Admin-only mutations
router.post('/', authenticateAdmin, registerListing);
router.patch('/:id', authenticateAdmin, updateListing);
router.delete('/:id', authenticateAdmin, deleteListing);

// User-facing reads
router.get('/', authenticate, getAllListings);
router.get('/nearby', authenticate, getNearbyListings);
router.post('/search', authenticate, searchListings);
router.get('/recently-viewed', authenticate, recentlyViewed);
router.get('/:id', authenticate, getListing);

export default router;
