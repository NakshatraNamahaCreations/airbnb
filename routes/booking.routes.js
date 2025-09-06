import express from 'express';
import { createBooking, getAllBookings, getBookingById, updateBooking, deleteBooking, acceptBooking, rejectBooking } from '../controllers/booking.controller.js';
import { authenticate } from '../middlewares/authMiddleware.js';


const router = express.Router();

router.use(authenticate);

// enquiry
router.post('/:id/accept', acceptBooking);
router.post('/:id/reject', rejectBooking);

router.post('/', createBooking);
router.get('/', getAllBookings);
router.get('/:id', getBookingById);
router.put('/:id', updateBooking);
router.delete('/:id', deleteBooking);



export default router;
