import axios from "axios";

const SMS_CONFIG = {
  apiId: process.env.BULK_SMS_API_ID || "APIqJtjEDl3147894",
  apiPassword: process.env.BULK_SMS_API_PASSWORD || "COWTmeXv",
  sender: "OROREG",
};

export const sendOtpSms = async (mobile, otp) => {
  try {
    if (!mobile) throw new Error("Mobile is required");
    if (!otp) throw new Error("OTP is required");

    // ✅ MUST match DLT template text exactly
    const message =
      `Dear User, Your OTP for login to Ororegen Companies is ${otp}. Please do not share this with anyone`;

    const url = "https://bulksmsplans.com/api/verify";

    const response = await axios.get(url, {
      params: {
        api_id: SMS_CONFIG.apiId,
        api_password: SMS_CONFIG.apiPassword,
        sms_type: "Transactional",
        sms_encoding: "text",
        sender: SMS_CONFIG.sender,
        number: `91${mobile}`,
        message,      // ✅ keep {#var#}
        var1: otp,    // ✅ OTP goes here
      },
      timeout: 10000,
    });

    return response.data;
  } catch (error) {
    console.error("SMS sending failed:", error?.response?.data || error.message);
    throw new Error("Failed to send OTP SMS");
  }
};
