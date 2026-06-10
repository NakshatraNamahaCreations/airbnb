import express from 'express';
import { getMe, myWishlist, updateMe, becomeHost } from '../controllers/user.controller.js';
import { authenticate } from '../middlewares/authMiddleware.js';

const router = express.Router();

router.use(authenticate);

router.get('/me', getMe);
// router.get('/my-wishlist', myWishlist);
router.get('/me/wishlists/overview', myWishlist);
// Self-serve host upgrade (KYC-gated). Declared before /me/:id so the literal
// path isn't captured as an :id.
router.post('/me/become-host', becomeHost);
router.patch('/me/:id', updateMe);
// router.put('/:id', updateUser);

export default router;
