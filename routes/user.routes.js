import express from 'express';
import { getMe, myWishlist, updateMe } from '../controllers/user.controller.js';
import { authenticate } from '../middlewares/authMiddleware.js';

const router = express.Router();

router.use(authenticate);

router.get('/me', getMe);
router.get('/my-wishlist', myWishlist);
router.patch('/me/:id', updateMe);
// router.put('/:id', updateUser);

export default router;
