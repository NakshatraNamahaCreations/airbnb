import axios from "axios";
import User from "../models/user.model.js";


const generateKycToken = async (req, res) => {

  try {
    const response = await axios.post(
      "https://digilocker.meon.co.in/get_access_token",
      {
        company_name: process.env.MEON_COMPANY_NAME,
        secret_token: process.env.MEON_SECRET_TOKEN
      },
      {
        headers: {
          "Content-Type": "application/json"
        }
      }
    );


    const clientToken = response?.data?.client_token;
    const state = response?.data?.state;

    if (!clientToken) {
      return res.status(400).json({
        success: false,
        message: "Failed to generate client token"
      });
    }

    return res.json({
      success: true,
      message: "Client token generated successfully",
      client_token: clientToken,
      state: state,
      redirectURL: `https://digilocker.meon.co.in/initiatedigilockerauth?client_token=${clientToken}&state=${state}&redirectURL=${process.env.MEON_REDIRECT_URL}`
    });


  } catch (error) {
    console.error("Generate KYC Token Error:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to generate KYC access token",
      error: error.message
    });
  }
};


const getDigiLockerUrl = async (req, res) => {
  try {
    const { client_token } = req.body;

    if (!client_token) {
      return res.status(400).json({
        success: false,
        message: "client_token missing"
      });
    }

    const response = await axios.post(
      "https://digilocker.meon.co.in/digi_url",
      {
        client_token: client_token,
        redirect_url: process.env.MEON_REDIRECT_URL,
        company_name: process.env.MEON_COMPANY_NAME,
        documents: "aadhaar,pan"
      },
      {
        headers: { "Content-Type": "application/json" }
      }
    );

    return res.json({
      success: true,
      url: response.data?.url || null
    });

  } catch (error) {
    console.error("getDigiLockerUrl Error:", error);
    return res.status(500).json({
      message: "Error generating DigiLocker URL",
      error: error.message
    });
  }
};

/*
* 
* 
* 
* 
* 
*/
const initiateKyc = async (req, res) => {
  const { userId } = req.query;
  try {

    // 🔍 1️⃣ Find the user
    const user = await User.findById(userId);

    if (!user) {
      return res.status(404).json({ success: false, message: "User not found" });
    }

    if (user.aadhaar === true) {
      return res.status(200).json({
        message: "User already verified via KYC",
        data: { status: "verified" },
      });
    }
    // Step 1: Generate Access Token
    const tokenResponse = await axios.post("https://digilocker.meon.co.in/get_access_token", {
      company_name: process.env.MEON_COMPANY_NAME,
      secret_token: process.env.MEON_SECRET_TOKEN
    }, {
      headers: { "Content-Type": "application/json" }
    }
    );



    const clientToken = tokenResponse?.data?.client_token;
    const state = tokenResponse?.data?.state;

    if (!clientToken) {
      return res.status(400).json({
        success: false,
        message: "Failed to generate client token"
      });
    }

    // save d token data to user

    // Step 2: Generate DigiLocker URL
    const digiResponse = await axios.post("https://digilocker.meon.co.in/digi_url", {
      client_token: clientToken,
      redirect_url: `${process.env.MEON_REDIRECT_URL}?client_token=${clientToken}&state=${state}&userId=${userId}`,
      // redirect_url: `https://digilocker.meon.co.in/initiatedigilockerauth?client_token=${client_token}&state=${state}&redirectURL=${process.env.MEON_REDIRECT_URL}`,
      company_name: process.env.MEON_COMPANY_NAME,
      documents: "aadhaar,pan"
    }, {
      headers: { "Content-Type": "application/json" }
    }
    );



    const digiUrl = digiResponse?.data?.url;

    if (!digiUrl) {
      return res.status(400).json({
        success: false,
        message: "Failed to generate DigiLocker URL"
      });
    }

    user.meonKyc = {
      clientToken,
      state,
    
      status: "token_generated",
      startedAt: new Date(),
      status: "link_generated",
      lastInitiatedAt: new Date()
    };
    await user.save();


    // Final Combined Response
    return res.status(200).json({
      message: "DigiLocker Url generated successfully",
      data: {
      
        clientToken,
        state,
        digiUrl,
    
      }
    });

  } catch (error) {
    console.error("initiateKyc Error:", error?.response?.data || error.message);
    return res.status(500).json({
      success: false,
      message: "Failed to initiate KYC",
      error: error?.response?.data || error.message
    });
  }
};



/* -----------------------------------------------------------
   ✅ 2. CALLBACK (DIGILOCKER → BACKEND)
------------------------------------------------------------- */
const meonCallback = async (req, res) => {


  const { client_token, state ,userId} = req.query
  console.log("meoncallback: ", { client_token, state })

  if (!client_token || !state) {
    console.log("Missing clientToken or state in callback: ", )
    return res.status(400).json({
      message: "Missing clientToken or state in callback"
    });
  }

   const user = await User.findById(userId);

 
  if (!user) {
    console.log("user not found: ")
    return res.status(404).json({ message: "User not found" });
  }



  const payload = {
    client_token: client_token,
    state
  }


  try {
    const response = await axios.post("https://digilocker.meon.co.in/v2/send_entire_data",
      payload,
      {
        headers: {
          "Content-Type": "application/json"
        }
      }
    );

    const kycData = response.data?.data; // 👈 this contains the actual fields



    // Extract Aadhaar fields safely
    const aadhaar = {
      name: kycData?.name || "",
      fatherName: kycData?.fathername || "",
      dob: kycData?.dob || "",
      gender: kycData?.gender || "",
      country: kycData?.country || "",
      dist: kycData?.dist || "",
      state: kycData?.state || "",
      pincode: kycData?.pincode || "",
      house: kycData?.house || "",
      locality: kycData?.locality || "",
      address: kycData?.aadhar_address || "",
      maskedAadhaar: kycData?.aadhar_no || "",
      aadharAddress: kycData?.aadhar_address || "",
      aadharFile: kycData?.aadhar_filename || "",
      aadharImage: kycData?.aadhar_img_filename || "",
      aadharXml: kycData?.aadhar_xml || "",
      aadharImg: kycData?.adharimg || "",
      dateTime: kycData?.date_time || "",
    };

    // Extract PAN fields safely
    const pan = {
      panNumber: kycData?.pan_number || "",
      panImage: kycData?.pan_image_path || "",
      nameOnPan: kycData?.name_on_pan || "",
    };

user.aadhaar=true;
    // Update user
    user.meonKyc = {
      ...user.meonKyc,  
      aadhaar,
      pan,
      kycData,          // full response for audit/log
      status: "verified",
      verifiedAt: new Date(),
      updatedAt: new Date(),
    };

    await user.save();




    return res.status(200).json({
      message: "Callback received",
      data: response.data
    });
  } catch (error) {
    console.error("Callback Error:", error);
    return res.status(500).json({
      message: "Callback processing failed",
      error: error.message
    });
  }
};


/* -----------------------------------------------------------
   ✅ 3. RETRIEVE AADHAAR DATA
------------------------------------------------------------- */
const retrieveAadhaar = async (req, res) => {
  try {
    const { token } = req.body;
    const userId = req.user._id;

    const user = await User.findById(userId);

    if (!user?.meonRequestId) {
      return res.status(400).json({
        success: false,
        message: "User has no saved request_id"
      });
    }

    const response = await axios.post(
      "https://developer.meon.co.in/api/aadhaar/fetch/retrieve-data",
      {
        request_id: user.meonRequestId,
        token
      }
    );

    const data = response?.data;

    if (!data?.name) {
      return res.status(400).json({
        success: false,
        message: "Failed to retrieve Aadhaar data"
      });
    }

    await User.findByIdAndUpdate(userId, {
      aadhaarData: {
        name: data.name,
        dob: data.dob,
        gender: data.gender,
        address: data.address,
        aadhaarPhoto: data.photo
      }
    });

    return res.json({
      success: true,
      message: "Aadhaar data retrieved successfully",
      data
    });
  } catch (error) {
    console.error("Retrieve Aadhaar Error:", error);
    return res.status(500).json({
      message: "Failed to retrieve Aadhaar data",
      error: error.message
    });
  }
};


/* -----------------------------------------------------------
   ✅ 4. FACE MATCH
------------------------------------------------------------- */
const faceMatch = async (req, res) => {
  try {
    const { selfie } = req.body;
    const userId = req.user._id;

    const user = await User.findById(userId);

    if (!selfie || !user?.aadhaarData?.aadhaarPhoto) {
      return res.status(400).json({
        success: false,
        message: "Missing selfie or Aadhaar photo"
      });
    }

    const response = await axios.post(
      "https://developer.meon.co.in/api/face/match",
      {
        selfie_image: selfie,
        id_image: user.aadhaarData.aadhaarPhoto,
        reference_id: String(userId)
      },
      {
        headers: {
          "x-api-key": process.env.MEON_API_KEY,
          "Content-Type": "application/json"
        }
      }
    );

    const result = response?.data;

    const verified =
      result?.match_score >= 0.85 && result?.liveness_score >= 0.85;

    await User.findByIdAndUpdate(userId, {
      identityVerified: verified,
      matchScore: result?.match_score,
      livenessScore: result?.liveness_score,
      verifiedAt: verified ? new Date() : null
    });

    return res.json({
      success: true,
      message: verified
        ? "User verified successfully"
        : "User verification failed",
      result
    });
  } catch (error) {
    console.error("Face Match Error:", error);
    return res.status(500).json({
      message: "Face match failed",
      error: error.message
    });
  }
};


const generateFaceToken = async (req, res) => {
  try {
    const payload = {
      client_id: process.env.MEON_IPV_CLIENT_ID,
      client_secret: process.env.MEON_IPV_CLIENT_SECRET
    };
    console.log("SENDING PAYLOAD:", payload);


    const response = await axios.post("https://face-finder.meon.co.in/backend/generate_token_for_ipv_credentials",
      payload,
      {
        headers: { "Content-Type": "application/json" }
      }
    );

    console.log("response.data: ", response.data)

    const ipvToken = response?.data?.data?.token;   // ✅ FIXED

    if (!ipvToken) {
      return res.status(400).json({
        success: false,
        message: "Failed to generate IPV token"
      });
    }

    return res.json({
      data: ipvToken
    });

  } catch (error) {
    console.error("Generate IPV Token Error:", error.response?.data || error.message);
    return res.status(500).json({
      success: false,
      message: "Failed to generate IPV token",
      error: error.response?.data || error.message
    });
  }
};





export {
  generateKycToken,
  getDigiLockerUrl,
  initiateKyc,
  meonCallback,
  retrieveAadhaar,
  faceMatch,
  generateFaceToken
};
