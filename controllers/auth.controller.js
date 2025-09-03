import bcrypt from 'bcryptjs';
import { v4 as uuidv4 } from 'uuid';
import OtpSession from '../models/otpSession.model.js';
import User from '../models/user.model.js';
import { generateToken } from '../utils/createToken.js';

const OTP_LEN = 6;
const OTP_TTL_MIN = 10;       // dev TTL
const MAX_ATTEMPTS = 5;

const generateOtp = () => String(Math.floor(10 ** (OTP_LEN - 1) + Math.random() * 9 * 10 ** (OTP_LEN - 1)));
const minutesFromNow = (m) => new Date(Date.now() + m * 60 * 1000);

const normalizePhone = (phone) => phone?.replace(/\s+/g, '') || '';
const normalizeIndianMobile = (raw) => {
  const digits = String(raw || '').replace(/\D/g, ''); // drop spaces/+ etc.
  let n = digits;
  if (n.startsWith('91') && n.length === 12) n = n.slice(2); // strip country code
  if (n.startsWith('0') && n.length === 11) n = n.slice(1); // strip trunk 0
  if (!/^[6-9]\d{9}$/.test(n)) return null; // invalid
  return n; // store as 10-digit local
  // or return `+91${n}` to store in E.164
};







const startOtp = async(req, res) => {
  try {
    const { phone } = req.body;
    if (!phone) {
      return res.status(422).json({ message: 'phone required' });
    }
    const normalizedPhone = normalizeIndianMobile(phone);

    // Expire any previous pending sessions for this phone (optional safety)
    await OtpSession.updateMany(
      { phone, status: 'pending' },
      { $set: { status: 'expired' } },
    );

    const otp = generateOtp();
    const otpHash = await bcrypt.hash(otp, 10);
    const sessionId = uuidv4();

    await OtpSession.create({
      sessionId,
      phone,
      otpHash,
      status: 'pending',
      attempts: 0,
      expiresAt: minutesFromNow(OTP_TTL_MIN),
    });

    const payload = { sessionId, otp, expiresInMinutes: OTP_TTL_MIN };

    return res.status(200).json({ data: payload });
  } catch (err) {
    console.error('startOtp error:', err);
    return res.status(500).json({ ok: false, message: 'internal_error' });
  }
};










/**
 * POST /auth/verify-otp
 * body: { sessionId, phone, otp }
 * success:
 *  - if user exists -> { ok:true, isNew:false, userPreview:{ name,email,dateOfBirth,phone } }
 *  - if no user     -> { ok:true, isNew:true, required:['name','dateOfBirth','email'], phone }
 */
const verifyOtp = async(req, res) => {
  try {
    const { sessionId, otp } = req.body || {};
    const phone = normalizePhone(req.body?.phone);
    if (!sessionId || !phone || !otp) {
      return res.status(400).json({ ok: false, message: 'sessionId, phone, otp required' });
    }

    const sess = await OtpSession.findOne({ sessionId, phone }).lean();
    if (!sess) return res.status(400).json({ ok: false, message: 'invalid_session' });

    if (sess.status !== 'pending') {
      return res.status(400).json({ ok: false, message: `session_not_pending:${sess.status}` });
    }

    if (new Date() > new Date(sess.expiresAt)) {
      // mark expired (best-effort)
      await OtpSession.updateOne({ _id: sess._id }, { $set: { status: 'expired' } });
      return res.status(400).json({ ok: false, message: 'otp_expired' });
    }

    if (sess.attempts >= MAX_ATTEMPTS) {
      await OtpSession.updateOne({ _id: sess._id }, { $set: { status: 'expired' } });
      return res.status(429).json({ ok: false, message: 'too_many_attempts' });
    }

    const ok = await bcrypt.compare(String(otp), sess.otpHash);
    if (!ok) {
      await OtpSession.updateOne({ _id: sess._id }, { $inc: { attempts: 1 } });
      return res.status(400).json({ ok: false, message: 'otp_incorrect', attemptsLeft: Math.max(0, MAX_ATTEMPTS - (sess.attempts + 1)) });
    }

    // success: mark verified
    await OtpSession.updateOne(
      { _id: sess._id },
      { $set: { status: 'verified', verifiedAt: new Date() } },
    );

    const existing = await User.findOne({ phone }).lean();
    if (existing) {
      const userPreview = {
        id: existing._id,
        name: existing.name || '',
        email: existing.email || '',
        dateOfBirth: existing.dateOfBirth || '',
        phone: existing.phone,
      };


      const token = generateToken(existing._id, existing.roles, existing.phone, existing.email);
      return res.status(200).json({ data: { token, isNew: false, userPreview } });
    }

    // no user -> mobile should show form for name, dateOfBirth, email
    return res.status(200).json({
      isNew: true,
      required: ['name', 'dateOfBirth', 'email'],
      phone,
    });
  } catch (err) {
    console.error('verifyOtp error:', err);
    return res.status(500).json({ ok: false, message: 'internal_error' });
  }
};













/**
 * POST /auth/create-user
 * body: { sessionId, phone, name, dateOfBirth, email }
 * Requires the session to be 'verified'. Creates the user and consumes the session.
 */
const registerUser = async(req, res) => {
  try {
    const { sessionId, name, dateOfBirth, email } = req.body || {};
    const phone = normalizePhone(req.body?.phone);
    if (!sessionId || !phone || !name || !dateOfBirth || !email) {
      return res.status(422).json({ message: 'sessionId, phone, name, dateOfBirth, email required' });
    }

    const sess = await OtpSession.findOne({ sessionId, phone }).lean();
    if (!sess) return res.status(400).json({ ok: false, message: 'invalid_session' });
    if (sess.status !== 'verified') return res.status(400).json({ ok: false, message: `session_not_verified:${sess.status}` });
    if (new Date() > new Date(sess.expiresAt)) {
      await OtpSession.updateOne({ _id: sess._id }, { $set: { status: 'expired' } });
      return res.status(400).json({ ok: false, message: 'session_expired' });
    }

    const existing = await User.findOne({ phone }).lean();
    if (existing) {
      // consume session anyway to avoid reuse
      await OtpSession.updateOne({ _id: sess._id }, { $set: { status: 'consumed' } });
      return res.status(200).json({
        data: {
          alreadyExists: true,
          user: { id: existing._id, name: existing.name, email: existing.email, dateOfBirth: existing.dateOfBirth, phone: existing.phone },
        },
      });
    }

    const user = await User.create({
      phone,
      name,
      email,
      dateOfBirth,
      roles: ['guest'],
      hostProfile: { isHost: false, status: 'pending', listings: [], documents: [] },
    });

    // mark session consumed
    await OtpSession.updateOne({ _id: sess._id }, { $set: { status: 'consumed' } });

    // You can mint JWT here if needed; returning user for now
    return res.status(201).json({
      data: {
        isCreated: true,
        user: { id: user._id, name: user.name, email: user.email, dateOfBirth: user.dateOfBirth, phone: user.phone, roles: user.roles },
      },
    });
  } catch (err) {
    console.error('createUser error:', err);
    return res.status(500).json({ ok: false, message: 'internal_error' });
  }
};









// // Create a new user with location
// const createUser = async(req, res) => {
//   const { name, email, latitude, longitude } = req.body;

//   try {
//     // Create a new User document with GeoJSON location data
//     const userLocation = new Location({
//       location: {
//         type: 'Point',
//         coordinates: [longitude, latitude], // [longitude, latitude]
//       },
//     });

//     await userLocation.save(); // Save the location first

//     const newUser = new User({
//       name,
//       email,
//       location: userLocation._id, // Store the location reference in the user document
//     });

//     await newUser.save();
//     res.status(201).json({ message: 'User created successfully', user: newUser });
//   } catch (err) {
//     res.status(500).json({ error: 'Error creating user', details: err.message });
//   }
// };

// // Get a user's profile
// const getUserProfile = async(req, res) => {
//   try {
//     const user = await User.findById(req.params.id).populate('location'); // Populate location data
//     if (!user) return res.status(404).json({ message: 'User not found' });

//     res.status(200).json(user);
//   } catch (err) {
//     res.status(500).json({ error: 'Error retrieving user profile', details: err.message });
//   }
// };


export { startOtp, verifyOtp, registerUser };
