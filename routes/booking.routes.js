import express from 'express';
import {
  createBookingOrder,
  verifyBookingPayment,
  cancelBookingByGuest,
  getAllBookings,
  getBookingById,
  bookingHistory,
  updateBooking,
  deleteBooking,
} from '../controllers/booking.controller.js';
import { authenticate } from '../middlewares/authMiddleware.js';

const router = express.Router();

router.use(authenticate);

// New Razorpay flow
router.post('/order', createBookingOrder);
router.post('/verify', verifyBookingPayment);
router.post('/:bookingId/cancel', cancelBookingByGuest);

// Reads (scoped to caller)
router.get('/history', bookingHistory);
router.get('/', getAllBookings);
router.get('/:id', getBookingById);

// Legacy update / delete (kept for back-compat; admins use /admin/bookings/*)
router.put('/:id', updateBooking);
router.delete('/:id', deleteBooking);

export default router;
