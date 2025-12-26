import express from 'express';
import { startOtp, verifyOtp, registerUser } from '../controllers/auth.controller.js';
import { otpSendLimiter } from "../middleware/rateLimit.js";

const router = express.Router();

router.post('/otp', otpSendLimiter, startOtp);
router.post('/otp/verify', otpSendLimiter, verifyOtp);
// router.post('/otp/resend', auth.resendOtp);


router.post('/register', registerUser);
// router.post('/login', loginUser);
// router.post('/logout', logoutUser);
// router.post('/refresh', ); token

export default router;
