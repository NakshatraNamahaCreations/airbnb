import bcrypt from 'bcryptjs';
import User from '../models/user.model.js';
import { generateAdminToken, generateToken } from '../utils/createToken.js';
import Admin from '../models/admin.model.js';



const getAllUsers = async (req, res) => {
  try {
    const users = await User.find().lean();

    res.status(200).json({
      message: 'All User fecthed successfully',
      data: users,
    });
  } catch (err) {
    return res.status(500).json({ message: 'internal_error', details: err?.message });
  }
};

// Admin signup with email/password using Admin model
const adminSignup = async (req, res) => {
  console.log(`adminsignup `,);
  try {
    const { email, password } = req.body || {};

    if (!email || !password) {
      return res.status(422).json({ message: 'email and password required' });
    }

    const existing = await Admin.findOne({ email }).lean();
    if (existing) {
      return res.status(400).json({ message: 'admin already exists' });
    }

    const passwordHash = await bcrypt.hash(String(password), 10);
    const admin = await Admin.create({ email, password: passwordHash });

    const token = generateAdminToken(res, admin._id, admin.email);

    return res.status(201).json({ message: 'admin created', data: { token, admin } });
  } catch (err) {
    return res.status(500).json({ message: 'internal_error', details: err?.message });
  }
};

// Admin login with email/password
const adminLogin = async (req, res) => {
  try {
    const { email, password } = req.body || {};
  

    if (!email || !password) {
      return res.status(422).json({ message: 'email and password required' });
    }

    const admin = await Admin.findOne({ email });
   

    if (!admin) {
      return res.status(401).json({ message: 'invalid credentials' });
    }

    const ok = await bcrypt.compare(String(password), admin.password || '');

    if (!ok) {
      return res.status(401).json({ message: 'invalid credentials' });
    }

    const token = generateAdminToken(res, admin._id, admin.email);

    return res.status(200).json({ message: 'login successful', data: { token, admin } });
  } catch (err) {
    return res.status(500).json({ message: 'internal_error', details: err?.message });
  }
};

// Get current admin profile (requires admin auth middleware to set req.adminId)
const getMe = async (req, res) => {
  try {
    const admin = await Admin.findById(req.userId).select('-password').lean();
    if (!admin) {
      return res.status(404).json({ message: 'admin not found' });
    }
    return res.status(200).json({ message: 'admin profile fetched succesfully', data: admin });
  } catch (err) {
    return res.status(500).json({ message: 'internal_error', details: err?.message });
  }
};

// Update current admin profile
const updateMe = async (req, res) => {
  try {
    const { name, phone, password } = req.body || {};

    const updates = {};
    if (typeof name === 'string') updates.name = name;
    if (typeof password === 'string' && password) {
      updates.password = await bcrypt.hash(String(password), 10);
    }

    const admin = await Admin.findByIdAndUpdate(
      req.adminId,
      { $set: updates },
      { new: true }
    );

    if (!admin) {
      return res.status(404).json({ message: 'admin not found' });
    }

    return res.status(200).json({ message: 'updated', data: admin });
  } catch (err) {
    return res.status(500).json({ message: 'internal_error', details: err?.message });
  }
};

const upgradeToHost = async (req, res) => {
  try {
    const { userId } = req.params;
    if (!userId) {
      return res.status(400).json({ message: 'userId nededed' });
    }

    const user = await User.findByIdAndUpdate(
      userId,
      { $addToSet: { roles: 'host' } },
      { new: true }, // return updated doc
    );

    if (!user) {
      return res.status(404).json({ message: 'user doesnt exist' });
    }

    res.status(200).json({
      message: 'user became host successfully',
      data: user,
    });
  } catch (err) {
    return res.status(500).json({ message: 'internal_error', details: err?.message });
  }
};

export { getAllUsers, adminSignup, adminLogin, getMe, updateMe, upgradeToHost };
