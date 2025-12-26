import express from 'express';
import { createWishlist, getMyWishlists, getWishlist, toggleWishlist, updateWishlist, deleteWishlist } from '../controllers/wishlist.controller.js';
import { authenticate } from '../middlewares/authMiddleware.js';

const router = express.Router();

// router.use(authenticate);

// favorites
router.post('/favorite', toggleWishlist);
// router.delete('/:wishlistId/listings/:listingId', removeFromWishlist);
// router.get('/:wishlistId/listings', getWishlistListings);

router.post('/', createWishlist);
router.get('/', getMyWishlists);
router.get('/:id', getWishlist);
router.patch('/:id', updateWishlist);
router.delete('/:id', deleteWishlist);



export default router;
