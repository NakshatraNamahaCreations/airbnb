import express from "express";
import {
  initiateKycForFaceToken,
  exportCapturedData,

} from "../controllers/ipv.controller.js";

const router = express.Router();

// initiate IPV
router.post("/generate-face-token", initiateKycForFaceToken);

// export using transaction_id
router.get("/export-ipv", exportCapturedData);



export default router;
