import mongoose from 'mongoose';

const OtpSessionSchema = new mongoose.Schema({
  sessionId: { type: String, unique: true, index: true },
  phone: { type: String, index: true },
  otpHash: { type: String, required: true },
  status: { type: String, enum: ['pending', 'verified', 'consumed', 'expired'], default: 'pending', index: true },
  attempts: { type: Number, default: 0 },
  verifiedAt: { type: Date },
  expiresAt: { type: Date, index: { expires: 0 } }, // TTL at the exact expiresAt time
  meta: { type: Object, default: {} },
}, { timestamps: true });

const OtpSession = mongoose.model('OtpSession', OtpSessionSchema);

export default OtpSession;
