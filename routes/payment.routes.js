import express from 'express';
import { authenticate } from '../middlewares/authMiddleware.js';
import {
  createPayment,
  getPayments,
  getPaymentById,
  updatePayment,
  deletePayment,
} from '../controllers/payment.controller.js';

const router = express.Router();

// User-facing payments. Admin payments live at /admin/payments.
router.use(authenticate);

router.post('/', createPayment);
router.get('/', getPayments);
router.get('/:id', getPaymentById);
router.put('/:id', updatePayment);
router.delete('/:id', deletePayment);

export default router;
