import express from 'express';
import { authenticate, authorizeRoles } from '../middlewares/authMiddleware.js';
import { createFeatured, getFeatured, getFeaturedById } from '../controllers/featured.controller.js';

const router = express.Router();

router.use(authenticate);
// router.use(authorizeRoles('admin'));


router.post('/', createFeatured);
router.get('/', getFeatured);
router.get('/:id', getFeaturedById);
// router.put('/:id', updateFeatured);
// router.delete('/:id', deleteFeatured);


export default router;
