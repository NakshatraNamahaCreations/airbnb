import express from 'express';
import { presignListingImages } from '../controllers/upload.controller.js';
import { authenticate, authenticateAdmin } from '../middlewares/authMiddleware.js';

const router = express.Router();

// Admin uploads listing images (admins create listings on behalf of hosts).
router.post('/presign', authenticateAdmin, presignListingImages);

// Host self-serve image uploads (controller already keys by req.userId).
router.post('/me/presign', authenticate, presignListingImages);

export default router;
