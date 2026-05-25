import express from 'express';
import { presignListingImages } from '../controllers/upload.controller.js';
import { authenticateAdmin } from '../middlewares/authMiddleware.js';

const router = express.Router();

// Admin uploads listing images (admins create listings on behalf of hosts).
router.post('/presign', authenticateAdmin, presignListingImages);

export default router;
