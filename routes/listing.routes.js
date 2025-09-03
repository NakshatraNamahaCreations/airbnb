import express from 'express';
import { registerListing, recentlyViewed, getListing, getMyListings, getNearbyListings, updateListing, deleteListing, searchListings } from '../controllers/listing.controller.js';
import { authenticate, authorizeRoles } from '../middlewares/authMiddleware.js';

const router = express.Router();

router.use(authenticate);

router.post('/', authorizeRoles('host'), registerListing);
router.get('/', getMyListings);
router.get('/nearby', getNearbyListings);
router.post('/search', searchListings);
router.get('/recently-viewed', recentlyViewed);
router.get('/:id', getListing);
router.patch('/:id', updateListing);
router.delete('/:id', deleteListing);

export default router;
