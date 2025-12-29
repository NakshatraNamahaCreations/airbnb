import express from 'express';
import { authenticate } from '../middlewares/authMiddleware.js';
import { generateKycToken, meonCallback, retrieveAadhaar, faceMatch, getDigiLockerUrl, generateFaceToken, initiateKyc } from '../controllers/kyc.controller.js';

const router = express.Router();


router.get('/callback', meonCallback);
router.use(authenticate);


router.get('/generate-token', generateKycToken);
router.post('/get-digilocker-url', getDigiLockerUrl);
router.post('/retrieve-aadhaar', retrieveAadhaar);
router.post('/face-match', faceMatch);

// aadhar verify
router.get('/generate-aadhar-url', initiateKyc);


// router.get("/generate-face-token", generateFaceToken);

export default router;
