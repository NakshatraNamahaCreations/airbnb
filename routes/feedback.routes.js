import express from 'express';
import { addFeedback, getFeedbacks, getListingAverageRating, updateFeedback, deleteFeedback } from '../controllers/feedback.controller.js';
import { authenticate } from '../middlewares/authMiddleware.js';

const router = express.Router();

router.use(authenticate)

// POST /api/v1/ratings/:listingId → add/update rating
router.post('/:listingId', addFeedback);

// GET /api/v1/ratings/:listingId → get all ratings for listing
router.get('/:listingId', getFeedbacks);

// GET /api/v1/ratings/:listingId/average → get average rating
router.get('/:listingId/average', getListingAverageRating);

router.put('/:listingId', updateFeedback);
router.delete('/:listingId', deleteFeedback);

export default router;
