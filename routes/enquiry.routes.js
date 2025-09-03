import express from 'express';
import { createEnquiry, getAllEnquiries, getEnquiryById, updateEnquiry, deleteEnquiry, acceptEnquiry, rejectEnquiry } from '../controllers/enquiry.controller.js';
import { authenticate } from '../middlewares/authMiddleware.js';


const router = express.Router();

router.use(authenticate);

// enquiry
router.post('/:id/accept', acceptEnquiry);
router.post('/:id/reject', rejectEnquiry);

router.post('/', createEnquiry);
router.get('/', getAllEnquiries);
router.get('/:id', getEnquiryById);
router.put('/:id', updateEnquiry);
router.delete('/:id', deleteEnquiry);



export default router;
