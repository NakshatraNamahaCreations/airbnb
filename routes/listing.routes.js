import express from 'express';
import { registerListing, recentlyViewed, getAllListings, getMyListings, getListing, getNearbyListings, updateListing, deleteListing, searchListings } from '../controllers/listing.controller.js';
import { authenticate, authenticateAdmin,  } from '../middlewares/authMiddleware.js';

const router = express.Router();


router.post('/', authenticateAdmin, registerListing);

// router.use(authenticate); 
// router.post('/', registerListing);
router.get('/', getAllListings);
router.get('/me', getMyListings);
router.get('/nearby', getNearbyListings);
router.post('/search', searchListings);
router.get('/recently-viewed', recentlyViewed);
router.get('/:id', getListing);
router.patch('/:id', authenticateAdmin, updateListing);
router.delete('/:id', authenticateAdmin, deleteListing);

export default router;
