import express from 'express';
import { presignListingImages } from '../controllers/upload.controller.js';
import { authenticate, authorizeRoles } from '../middlewares/authMiddleware.js';

const router = express.Router();

router.use(authenticate, authorizeRoles('host'));

router.post('/presign', presignListingImages);

export default router;
