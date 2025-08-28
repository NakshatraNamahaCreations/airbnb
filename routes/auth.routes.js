import express from 'express';
import { startOtp, verifyOtp, registerUser } from '../controllers/auth.controller.js';


const router = express.Router();

router.post('/otp', startOtp);
router.post('/otp/verify', verifyOtp);
// router.post('/otp/resend', auth.resendOtp);


router.post('/register', registerUser);
// router.post('/login', loginUser);
// router.post('/logout', logoutUser);
// router.post('/refresh', ); token

export default router;
