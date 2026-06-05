import express from 'express';
import { razorpayWebhook } from '../controllers/webhook.controller.js';

const router = express.Router();

/*
 * Webhook route. Mounted with express.raw() so the body remains the original
 * bytes — required for HMAC-SHA256 signature verification over the raw body.
 *
 * IMPORTANT: do not add other middleware here that parses the body before
 * the signature check.
 */
router.post('/', express.raw({ type: '*/*', limit: '1mb' }), razorpayWebhook);

export default router;
