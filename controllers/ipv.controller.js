import axios from "axios";
import crypto from "crypto";

import { saveStateTxn } from "../store/ipvStore.js";
import User from "../models/user.model.js";

const MEON_BASE = "https://face-finder.meon.co.in";

/**
 * Convert an image URL to base64 (and also return a data URI).
 * Uses axios arraybuffer so it works in Node easily.
 */
const imageUrlToBase64 = async (url) => {
  try {
    if (!url || typeof url !== "string")
      return { base64: null, dataUri: null, contentType: null };

    // If not a URL, maybe it's already base64 or a data-uri
    if (!/^https?:\/\//i.test(url)) {
      return { base64: url, dataUri: url, contentType: null };
    }

    const res = await axios.get(url, {
      responseType: "arraybuffer",
      timeout: 60000,
      maxContentLength: Infinity,
      maxBodyLength: Infinity,
      validateStatus: () => true,
    });

    if (res.status < 200 || res.status >= 300) {
      throw new Error(`Failed to fetch image. HTTP ${res.status}`);
    }

    const contentType =
      res.headers?.["content-type"] || "application/octet-stream";
    const base64 = Buffer.from(res.data).toString("base64");
    const dataUri = `data:${contentType};base64,${base64}`;

    return { base64, dataUri, contentType };
  } catch (err) {
    console.error("imageUrlToBase64 error:", err?.message || err);
    return { base64: null, dataUri: null, contentType: null };
  }
};

const stripDataUriPrefix = (val) => {
  try {
    if (!val || typeof val !== "string") return val;

    // If it's a data URI: data:image/jpeg;base64,xxxx
    if (val.startsWith("data:")) {
      const commaIndex = val.indexOf(",");
      if (commaIndex !== -1) return val.slice(commaIndex + 1);
    }

    return val; // already plain base64 or URL
  } catch (e) {
    return val;
  }
};

export const initiateKycForFaceToken = async (req, res) => {
  try {
    const clientId = process.env.MEON_IPV_CLIENT_ID;
    const clientSecret = process.env.MEON_IPV_CLIENT_SECRET;
    const userId = req.body.userId;

    if (!clientId || !clientSecret) {
      return res
        .status(400)
        .json({ message: "Missing MEON client credentials in env" });
    }
    const user = await User.findById(userId);

    if (!user) {
      return res
        .status(404)
        .json({ success: false, message: "User not found" });
    }

if (user.face == true) {
      return res
        .status(400)
        .json({ success: false, message: "User already verified" });
    }
    // You can pass state from frontend or generate here
    const state =
      req.query.state ||
      req.body?.state ||
      crypto.randomBytes(16).toString("hex");

    // Aadhaar / DigiLocker photo URL to match against selfie
    const imageToBeMatch = user?.meonKyc?.aadhaar.aadharImage;

    // OPTIONAL: if you want to control via request, send { use_base64: true/false }
    const useBase64 = req.body?.use_base64 !== false; // default true

    // Convert URL -> base64/data-uri (safe fallback to URL)
    const { dataUri: imageToBeMatchDataUri, base64: imageToBeMatchBase64 } =
      useBase64
        ? await imageUrlToBase64(imageToBeMatch)
        : { dataUri: null, base64: null };

    // Choose best available value and strip "data:image/...;base64," if present
    const imageToSendRaw =
      imageToBeMatchDataUri || imageToBeMatchBase64 || imageToBeMatch;
    const imageToSend = stripDataUriPrefix(imageToSendRaw);

    // 1) get session token
    const tokenUrl = `${MEON_BASE}/backend/generate_token_for_ipv_credentials`;

    const tokenResponse = await axios.post(
      tokenUrl,
      { client_id: clientId, client_secret: clientSecret },
      { headers: { "Content-Type": "application/json" }, timeout: 60000 }
    );

    const sessionToken = tokenResponse?.data?.data?.token;
    if (!sessionToken) {
      return res.status(400).json({
        message: "Failed to get session token",
        raw: tokenResponse?.data,
      });
    }

    const redirectUrl1 = `http://192.168.1.76:9000/api/v1/ipv-verifications/export-ipv?userId=${userId}`;

    const payload = {
      check_location: false,
      capture_video: false,
      match_face: true,
      read_script: false,
      text_script: false,
      video_time: false,
      image_to_be_match: imageToSend,
      redirectUrl: redirectUrl1,
    };

    // 2) initiate request (match_face must be true)
    const initiateRes = await axios.post(
      `${MEON_BASE}/backend/initiate_request`,
      payload,
      {
        headers: {
          token: sessionToken,
          "Content-Type": "application/json",
        },
        timeout: 60000,
      }
    );

    // Try to pick transaction_id from response
    const transactionId =
      initiateRes?.data?.data?.transaction_id ||
      initiateRes?.data?.transaction_id ||
      initiateRes?.data?.data?.txn_id ||
      initiateRes?.data?.txn_id ||
      null;

    // Try to pick redirect_url/capture_url
    const redirectUrl =
      initiateRes?.data?.data?.redirect_url ||
      initiateRes?.data?.redirect_url ||
      initiateRes?.data?.data?.capture_url ||
      initiateRes?.data?.capture_url ||
      null;

    // Save mapping (state -> transactionId)
    saveStateTxn(state, {
      userId,
      transactionId,
      initiateResponse: initiateRes.data,
      redirectUrl,
      imageToBeMatch,
      imageToSend: "[base64 omitted from logs/store]", // avoid storing huge base64
      useBase64,
    });

    return res.status(200).json({
      message: "IPV initiated",
      state,
      transaction_id: transactionId,

      data: initiateRes.data,
    });
  } catch (error) {
    console.error(
      "initiateKycForFaceToken error:",
      error?.response?.data || error?.message || error
    );
    return res.status(400).json({
      message: "Failed to initiate IPV",
      error: error?.response?.data || error?.message,
    });
  }
};

export const webhookapi = async (req, res) => {
  try {
    console.log(req.body, req.query);
    // const { success,userId, state } = req.query;
    // console.log("userId",userId)
    //  const transactionId = state;
    const clientId = process.env.MEON_IPV_CLIENT_ID;
    const clientSecret = process.env.MEON_IPV_CLIENT_SECRET;
    const transactionId = req.body.transaction_id;

    const user = await User.findById(userId);

    if (!clientId || !clientSecret) {
      return res
        .status(400)
        .json({ message: "Missing MEON client credentials in env" });
    }
    if (!transactionId) {
      return res.status(400).json({ message: "transaction_id is required" });
    }

    // 1) export token using transaction_id
    const exportTokenRes = await axios.post(
      `${MEON_BASE}/backend/generate_token_for_ipv_credentials`,
      {
        client_id: clientId,
        client_secret: clientSecret,
        transaction_id: transactionId,
      },
      { headers: { "Content-Type": "application/json" }, timeout: 60000 }
    );

    const exportToken = exportTokenRes?.data?.data?.token;
    if (!exportToken) {
      return res
        .status(400)
        .json({
          message: "Failed to get export token",
          raw: exportTokenRes?.data,
        });
    }

    // 2) export captured data
    const exportRes = await axios.get(`${MEON_BASE}/backend/export_data`, {
      headers: {
        token: exportToken,
        "Content-Type": "application/json",
      },
      timeout: 60000,
    });
    const result = exportRes.data?.data;
    user.face = result.faces_matched || false;
    user.faceUrl = result.image || ""; // store captured image
    user.faceMatchPercent = result.face_match_percentage || 0; 

    await user.save();

    console.log("exportRes.data:", exportRes.data);

    return res.status(200).json({
      message: "Export success",
      data: exportRes.data,
    });
  } catch (error) {
    console.error(
      "exportCapturedData error:",
      error?.response?.data || error?.message || error
    );
    return res.status(400).json({
      message: "Failed to export captured data",
      error: error?.response?.data || error?.message,
    });
  }
};


export const exportCapturedData = async (req, res) => {
  try {

    const clientId = process.env.MEON_IPV_CLIENT_ID;
    const clientSecret = process.env.MEON_IPV_CLIENT_SECRET;
    const transactionId = req.body.transaction_id;
    const userId = req.body.userId;

    const user = await User.findById(userId);

    if (!clientId || !clientSecret) {
      return res
        .status(400)
        .json({ message: "Missing MEON client credentials in env" });
    }
    if (!transactionId) {
      return res.status(400).json({ message: "transaction_id is required" });
    }

    // 1) export token using transaction_id
    const exportTokenRes = await axios.post(
      `${MEON_BASE}/backend/generate_token_for_ipv_credentials`,
      {
        client_id: clientId,
        client_secret: clientSecret,
        transaction_id: transactionId,
      },
      { headers: { "Content-Type": "application/json" }, timeout: 60000 }
    );

    const exportToken = exportTokenRes?.data?.data?.token;
    if (!exportToken) {
      return res
        .status(400)
        .json({
          message: "Failed to get export token",
          raw: exportTokenRes?.data,
        });
    }

    // 2) export captured data
    const exportRes = await axios.get(`${MEON_BASE}/backend/export_data`, {
      headers: {
        token: exportToken,
        "Content-Type": "application/json",
      },
      timeout: 60000,
    });
    const result = exportRes.data?.data;
    user.face = result.faces_matched || false;
    user.faceUrl = result.image || ""; // store captured image
    user.faceMatchPercent = result.face_match_percentage || 0; 

    await user.save();



    return res.status(200).json({
      message: "Export success",
      data: exportRes.data,
    });
  } catch (error) {
    console.error(
      "exportCapturedData error:",
      error?.response?.data || error?.message || error
    );
    return res.status(400).json({
      message: "Failed to export captured data",
      error: error?.response?.data || error?.message,
    });
  }
};