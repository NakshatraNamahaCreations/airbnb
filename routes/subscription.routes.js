import express from 'express';
import {
  createSubscriptionOrder,
  verifySubscriptionPayment,
  getMySubscription,
} from '../controllers/subscription.controller.js';
import { authenticate } from '../middlewares/authMiddleware.js';

const router = express.Router();

router.use(authenticate);

router.post('/order', createSubscriptionOrder);
router.post('/verify', verifySubscriptionPayment);
router.get('/me', getMySubscription);

export default router;
