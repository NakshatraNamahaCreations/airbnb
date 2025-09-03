import express from 'express';
import { addRating, getListingRatings, getListingAverageRating } from '../controllers/feedback.controller.js';

const router = express.Router();

// POST /api/v1/ratings/:listingId → add/update rating
router.post('/:listingId', addRating);

// GET /api/v1/ratings/:listingId → get all ratings for listing
router.get('/:listingId', getListingRatings);

// GET /api/v1/ratings/:listingId/average → get average rating
router.get('/:listingId/average', getListingAverageRating);

export default router;
