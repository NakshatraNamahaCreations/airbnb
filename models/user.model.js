import mongoose from "mongoose";
import { type } from "os";

const PanSchema = new mongoose.Schema({
  panNumber: { type: String },
  nameOnPan: { type: String }, // optional
  panImage: { type: String }, // PAN PDF/image URL
});

const AadhaarSchema = new mongoose.Schema({
  name: { type: String },
  fatherName: { type: String },
  dob: { type: String },
  gender: { type: String },
  country: { type: String },
  dist: { type: String },
  state: { type: String },
  pincode: { type: String },
  house: { type: String },
  locality: { type: String },
  address: { type: String }, // masked/full address
  maskedAadhaar: { type: String }, // e.g., xxxxxxxx7845
  aadharAddress: { type: String }, // full masked address from Meon
  aadharFile: { type: String }, // https://.../AADHAR.pdf
  aadharImage: { type: String }, // https://.../Photo.jpg
  aadharXml: { type: String }, // XML link
  aadharImg: { type: String }, // alternative image path
  dateTime: { type: String }, // from "date_time"
});

const MeonKycSchema = new mongoose.Schema(
  {
    // clientToken: { type: String },
    // state: { type: String },
    // txnId: { type: String },
    redirectUrl: { type: String },
    lastInitiatedAt: { type: Date },
    status: {
      type: String,
      enum: [
        "not_started",
        "token_generated",
        "link_generated",
        "permission_granted",
        "data_fetched",
        "verified",
        "failed",
      ],
      default: "not_started",
    },
    aadhaar: AadhaarSchema,
    pan: PanSchema,
    lastResponse: Object, // raw data from Meon
    completedAt: Date,
  },
  {
    _id: false,
    timestamps: true,
  }
);
const userSchema = mongoose.Schema(
  {
    phone: { type: String, unique: true, required: true },
    email: { type: String, unique: true },
    name: { type: String, required: false },
    dateOfBirth: { type: Date, required: false },
    // Role system
    roles: {
      type: [String],
      enum: ["guest", "host", "admin"],
      default: "guest",
    },
    
    profile: {
      age: { type: Number },
      gender: { type: String },
      location: { type: String }, // Optional, for additional profile info if needed
      // Add more fields based on your needs, such as phone number, bio, etc.
    },
    preferences: { type: Map, of: String, default: {} }, // guest personal prefs
    recentlyViewed: [
      {
        listing: { type: mongoose.Schema.Types.ObjectId, ref: "Listing" },
        viewedAt: { type: Date, default: Date.now },
      },
    ],


    hostProfile: {
     
      payoutDetails: {
        bankName: String,
        accountNumber: String,
        ifsc: String,
      },
      documents: [String], // e.g., ID proof, property verification
      wishlistIds: [{ type: mongoose.Schema.Types.ObjectId, ref: "Wishlist" }], // enforce max 10–20
    },
    aadhaar: { type: Boolean, default: false },
    face: { type: Boolean, default: false },
    faceUrl: { type: String, default: "" },
    faceMatchPercent: { type: Number, default: 0 },

    // identity verifications
    meonKyc: { type: MeonKycSchema, default: () => ({}) },
  },
  { timestamps: true }
);

const User = mongoose.model("User", userSchema);

export default User;
