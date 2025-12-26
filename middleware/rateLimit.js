import rateLimit from "express-rate-limit";

// Limits OTP send endpoint to 5 requests per 15 minutes per IP
const otpSendLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false
});

export { otpSendLimiter };
