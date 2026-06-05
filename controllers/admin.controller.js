import bcrypt from 'bcryptjs';
import mongoose from 'mongoose';
import dayjs from 'dayjs';

import User from '../models/user.model.js';
import Admin from '../models/admin.model.js';
import Listing from '../models/listing.model.js';
import Booking from '../models/booking.model.js';
import Payment from '../models/payment.model.js';
import Feedback from '../models/feedback.model.js';
import AuditLog from '../models/auditLog.model.js';
import { generateAdminToken } from '../utils/createToken.js';
import { parsePagination, buildPaginationMeta } from '../utils/pagination.js';
import { writeAudit } from '../utils/auditLogger.js';
import razorpayService from '../services/razorpay.service.js';

const isOid = (s) => mongoose.Types.ObjectId.isValid(s);

/* -------------------------------------------------------------------------- */
/* AUTH + SELF                                                                */
/* -------------------------------------------------------------------------- */

const adminLogin = async (req, res) => {
  try {
    const { email, password } = req.body || {};
    if (!email || !password) {
      return res.status(422).json({ message: 'email and password required' });
    }
    const admin = await Admin.findOne({ email });
    if (!admin) return res.status(401).json({ message: 'invalid credentials' });
    if (admin.status === 'suspended') {
      return res.status(403).json({ message: 'admin account suspended' });
    }

    const ok = await bcrypt.compare(String(password), admin.password || '');
    if (!ok) return res.status(401).json({ message: 'invalid credentials' });

    const token = generateAdminToken(res, admin._id, admin.email);
    await Admin.updateOne({ _id: admin._id }, { $set: { lastLoginAt: new Date() } });

    const safeAdmin = { ...admin.toObject() };
    delete safeAdmin.password;

    return res.status(200).json({ message: 'login successful', data: { token, admin: safeAdmin } });
  } catch (err) {
    return res.status(500).json({ message: 'internal_error', details: err?.message });
  }
};

const adminLogout = async (req, res) => {
  res.clearCookie('jwt');
  return res.status(200).json({ message: 'logged out' });
};

const getMe = async (req, res) => {
  try {
    const admin = await Admin.findById(req.adminId).select('-password').lean();
    if (!admin) return res.status(404).json({ message: 'admin not found' });
    return res.status(200).json({ message: 'admin profile fetched successfully', data: admin });
  } catch (err) {
    return res.status(500).json({ message: 'internal_error', details: err?.message });
  }
};

const updateMe = async (req, res) => {
  try {
    const { name, phone, password } = req.body || {};
    const updates = {};
    if (typeof name === 'string') updates.name = name;
    if (typeof phone === 'string') updates.phone = phone;
    if (typeof password === 'string' && password) {
      updates.password = await bcrypt.hash(String(password), 10);
    }

    const admin = await Admin.findByIdAndUpdate(
      req.adminId,
      { $set: updates },
      { new: true },
    ).select('-password');

    if (!admin) return res.status(404).json({ message: 'admin not found' });
    await writeAudit(req, { action: 'admin.self.update', target: { model: 'Admin', id: admin._id }, payload: { fields: Object.keys(updates) } });
    return res.status(200).json({ message: 'updated', data: admin });
  } catch (err) {
    return res.status(500).json({ message: 'internal_error', details: err?.message });
  }
};

/* -------------------------------------------------------------------------- */
/* ADMIN MANAGEMENT (super_admin only)                                        */
/* -------------------------------------------------------------------------- */

const listAdmins = async (req, res) => {
  try {
    const { page, limit, skip, sort, q } = parsePagination(req.query);
    const filter = {};
    if (q) {
      filter.$or = [
        { email: { $regex: q, $options: 'i' } },
        { name: { $regex: q, $options: 'i' } },
      ];
    }
    if (req.query.role) filter.role = req.query.role;
    if (req.query.status) filter.status = req.query.status;

    const [items, total] = await Promise.all([
      Admin.find(filter).select('-password').sort(sort).skip(skip).limit(limit).lean(),
      Admin.countDocuments(filter),
    ]);
    return res.status(200).json({ data: items, pagination: buildPaginationMeta(total, page, limit) });
  } catch (err) {
    return res.status(500).json({ message: 'internal_error', details: err?.message });
  }
};

const createAdmin = async (req, res) => {
  try {
    const { email, password, name, phone, role = 'admin' } = req.body || {};
    if (!email || !password) return res.status(422).json({ message: 'email and password required' });
    if (!['super_admin', 'admin', 'support'].includes(role)) {
      return res.status(422).json({ message: 'invalid role' });
    }
    const existing = await Admin.findOne({ email }).lean();
    if (existing) return res.status(409).json({ message: 'admin already exists' });

    const passwordHash = await bcrypt.hash(String(password), 10);
    const admin = await Admin.create({ email, password: passwordHash, name, phone, role });
    const safe = admin.toObject(); delete safe.password;

    await writeAudit(req, { action: 'admin.create', target: { model: 'Admin', id: admin._id }, payload: { email, role } });
    return res.status(201).json({ message: 'admin created', data: safe });
  } catch (err) {
    return res.status(500).json({ message: 'internal_error', details: err?.message });
  }
};

const updateAdmin = async (req, res) => {
  try {
    const { id } = req.params;
    if (!isOid(id)) return res.status(400).json({ message: 'invalid id' });

    const { name, phone, role, password, status } = req.body || {};
    const updates = {};
    if (typeof name === 'string') updates.name = name;
    if (typeof phone === 'string') updates.phone = phone;
    if (role && ['super_admin', 'admin', 'support'].includes(role)) updates.role = role;
    if (status && ['active', 'suspended'].includes(status)) updates.status = status;
    if (typeof password === 'string' && password) updates.password = await bcrypt.hash(String(password), 10);

    const admin = await Admin.findByIdAndUpdate(id, { $set: updates }, { new: true }).select('-password');
    if (!admin) return res.status(404).json({ message: 'admin not found' });

    await writeAudit(req, { action: 'admin.update', target: { model: 'Admin', id }, payload: { fields: Object.keys(updates) } });
    return res.status(200).json({ message: 'updated', data: admin });
  } catch (err) {
    return res.status(500).json({ message: 'internal_error', details: err?.message });
  }
};

const deleteAdmin = async (req, res) => {
  try {
    const { id } = req.params;
    if (!isOid(id)) return res.status(400).json({ message: 'invalid id' });
    if (String(req.adminId) === String(id)) {
      return res.status(400).json({ message: 'cannot delete yourself' });
    }
    const admin = await Admin.findByIdAndDelete(id);
    if (!admin) return res.status(404).json({ message: 'admin not found' });
    await writeAudit(req, { action: 'admin.delete', target: { model: 'Admin', id } });
    return res.status(200).json({ message: 'deleted' });
  } catch (err) {
    return res.status(500).json({ message: 'internal_error', details: err?.message });
  }
};

/* -------------------------------------------------------------------------- */
/* USERS                                                                      */
/* -------------------------------------------------------------------------- */

const getAllUsers = async (req, res) => {
  try {
    const { page, limit, skip, sort, q } = parsePagination(req.query);
    const filter = {};
    if (q) {
      filter.$or = [
        { name:  { $regex: q, $options: 'i' } },
        { email: { $regex: q, $options: 'i' } },
        { phone: { $regex: q, $options: 'i' } },
      ];
    }
    if (req.query.role) filter.roles = req.query.role;
    if (req.query.status) filter.status = req.query.status;
    if (req.query.kycStatus) filter['meonKyc.status'] = req.query.kycStatus;

    const [items, total] = await Promise.all([
      User.find(filter).sort(sort).skip(skip).limit(limit).lean(),
      User.countDocuments(filter),
    ]);
    return res.status(200).json({
      message: 'Users fetched successfully',
      data: items,
      pagination: buildPaginationMeta(total, page, limit),
    });
  } catch (err) {
    return res.status(500).json({ message: 'internal_error', details: err?.message });
  }
};

const getUserById = async (req, res) => {
  try {
    const { id } = req.params;
    if (!isOid(id)) return res.status(400).json({ message: 'invalid id' });

    const user = await User.findById(id).lean();
    if (!user) return res.status(404).json({ message: 'user not found' });

    const [bookings, listingsOwned, reviews] = await Promise.all([
      Booking.countDocuments({ guestId: id }),
      Listing.countDocuments({ hostId: id }),
      Feedback.countDocuments({ user: id }),
    ]);

    return res.status(200).json({
      data: { user, stats: { bookings, listingsOwned, reviews } },
    });
  } catch (err) {
    return res.status(500).json({ message: 'internal_error', details: err?.message });
  }
};

const updateUser = async (req, res) => {
  try {
    const { id } = req.params;
    if (!isOid(id)) return res.status(400).json({ message: 'invalid id' });

    const allowed = ['name', 'email', 'dateOfBirth', 'status', 'roles', 'suspensionReason'];
    const updates = {};
    for (const k of allowed) if (req.body[k] !== undefined) updates[k] = req.body[k];

    if (updates.status === 'suspended' && !updates.suspendedAt) {
      updates.suspendedAt = new Date();
    }

    const user = await User.findByIdAndUpdate(id, { $set: updates }, { new: true, runValidators: true });
    if (!user) return res.status(404).json({ message: 'user not found' });

    await writeAudit(req, { action: 'user.update', target: { model: 'User', id }, payload: { fields: Object.keys(updates) } });
    return res.status(200).json({ message: 'updated', data: user });
  } catch (err) {
    return res.status(500).json({ message: 'internal_error', details: err?.message });
  }
};

const suspendUser = async (req, res) => {
  try {
    const { id } = req.params;
    if (!isOid(id)) return res.status(400).json({ message: 'invalid id' });
    const { reason } = req.body || {};
    const user = await User.findByIdAndUpdate(
      id,
      { $set: { status: 'suspended', suspendedAt: new Date(), suspensionReason: reason || '' } },
      { new: true },
    );
    if (!user) return res.status(404).json({ message: 'user not found' });
    await writeAudit(req, { action: 'user.suspend', target: { model: 'User', id }, payload: { reason } });
    return res.status(200).json({ message: 'user suspended', data: user });
  } catch (err) {
    return res.status(500).json({ message: 'internal_error', details: err?.message });
  }
};

const activateUser = async (req, res) => {
  try {
    const { id } = req.params;
    if (!isOid(id)) return res.status(400).json({ message: 'invalid id' });
    const user = await User.findByIdAndUpdate(
      id,
      { $set: { status: 'active' }, $unset: { suspendedAt: '', suspensionReason: '' } },
      { new: true },
    );
    if (!user) return res.status(404).json({ message: 'user not found' });
    await writeAudit(req, { action: 'user.activate', target: { model: 'User', id } });
    return res.status(200).json({ message: 'user activated', data: user });
  } catch (err) {
    return res.status(500).json({ message: 'internal_error', details: err?.message });
  }
};

const deleteUser = async (req, res) => {
  try {
    const { id } = req.params;
    if (!isOid(id)) return res.status(400).json({ message: 'invalid id' });
    const user = await User.findByIdAndUpdate(id, { $set: { status: 'deleted' } }, { new: true });
    if (!user) return res.status(404).json({ message: 'user not found' });
    await writeAudit(req, { action: 'user.delete', target: { model: 'User', id } });
    return res.status(200).json({ message: 'user deleted (soft)', data: user });
  } catch (err) {
    return res.status(500).json({ message: 'internal_error', details: err?.message });
  }
};

// Admin creates a new host User directly (no OTP, no self-signup).
// Host does not log in themselves — admin manages everything on their behalf.
const createHost = async (req, res) => {
  try {
    const { phone, name, email, dateOfBirth } = req.body || {};

    if (!phone || !name || !email || !dateOfBirth) {
      return res.status(422).json({
        message: 'phone, name, email, dateOfBirth are required',
      });
    }

    const normalizedPhone = String(phone).replace(/\D/g, '').replace(/^91(?=\d{10}$)/, '');
    if (!/^[6-9]\d{9}$/.test(normalizedPhone)) {
      return res.status(422).json({ message: 'invalid Indian mobile number' });
    }

    const normalizedEmail = String(email).trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail)) {
      return res.status(422).json({ message: 'invalid email' });
    }

    const dob = new Date(dateOfBirth);
    if (Number.isNaN(dob.getTime())) {
      return res.status(422).json({ message: 'invalid dateOfBirth' });
    }

    const existing = await User.findOne({ $or: [{ phone: normalizedPhone }, { email: normalizedEmail }] }).lean();
    if (existing) {
      return res.status(409).json({
        message: 'user with this phone or email already exists. Use /admin/users/:id/upgrade-to-host instead.',
        data: { existingUserId: existing._id },
      });
    }

    const user = await User.create({
      phone: normalizedPhone,
      name: String(name).trim(),
      email: normalizedEmail,
      dateOfBirth: dob,
      roles: ['guest', 'host'],
    });

    await writeAudit(req, {
      action: 'host.create',
      target: { model: 'User', id: user._id },
      payload: { phone: normalizedPhone, email: normalizedEmail },
    });

    return res.status(201).json({ message: 'host created', data: user });
  } catch (err) {
    return res.status(500).json({ message: 'internal_error', details: err?.message });
  }
};

// Admin edits an existing host. Only users with the `host` role can be edited here.
// For non-host edits, use PATCH /admin/users/:id.
const updateHost = async (req, res) => {
  try {
    const { id } = req.params;
    if (!isOid(id)) return res.status(400).json({ message: 'invalid id' });

    const existing = await User.findById(id);
    if (!existing) return res.status(404).json({ message: 'host not found' });
    if (!existing.roles?.includes('host')) {
      return res.status(400).json({ message: 'user is not a host. Use /admin/users/:id for non-hosts.' });
    }

    const updates = {};

    if (req.body.name !== undefined) updates.name = String(req.body.name).trim();

    if (req.body.email !== undefined) {
      const normalizedEmail = String(req.body.email).trim().toLowerCase();
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail)) {
        return res.status(422).json({ message: 'invalid email' });
      }
      const dup = await User.findOne({ email: normalizedEmail, _id: { $ne: id } }).lean();
      if (dup) return res.status(409).json({ message: 'email already used by another user' });
      updates.email = normalizedEmail;
    }

    if (req.body.phone !== undefined) {
      const normalizedPhone = String(req.body.phone).replace(/\D/g, '').replace(/^91(?=\d{10}$)/, '');
      if (!/^[6-9]\d{9}$/.test(normalizedPhone)) {
        return res.status(422).json({ message: 'invalid Indian mobile number' });
      }
      const dup = await User.findOne({ phone: normalizedPhone, _id: { $ne: id } }).lean();
      if (dup) return res.status(409).json({ message: 'phone already used by another user' });
      updates.phone = normalizedPhone;
    }

    if (req.body.dateOfBirth !== undefined) {
      const dob = new Date(req.body.dateOfBirth);
      if (Number.isNaN(dob.getTime())) {
        return res.status(422).json({ message: 'invalid dateOfBirth' });
      }
      updates.dateOfBirth = dob;
    }

    if (Object.keys(updates).length === 0) {
      return res.status(200).json({ message: 'no_changes', data: existing });
    }

    const updated = await User.findByIdAndUpdate(id, { $set: updates }, { new: true, runValidators: true });

    await writeAudit(req, {
      action: 'host.update',
      target: { model: 'User', id },
      payload: { fields: Object.keys(updates) },
    });

    return res.status(200).json({ message: 'host updated', data: updated });
  } catch (err) {
    return res.status(500).json({ message: 'internal_error', details: err?.message });
  }
};

const upgradeToHost = async (req, res) => {
  try {
    const { id } = req.params;
    if (!isOid(id)) return res.status(400).json({ message: 'invalid id' });

    const user = await User.findByIdAndUpdate(id, { $addToSet: { roles: 'host' } }, { new: true });
    if (!user) return res.status(404).json({ message: 'user doesnt exist' });

    await writeAudit(req, { action: 'user.upgrade_to_host', target: { model: 'User', id } });
    return res.status(200).json({ message: 'user became host successfully', data: user });
  } catch (err) {
    return res.status(500).json({ message: 'internal_error', details: err?.message });
  }
};

const downgradeFromHost = async (req, res) => {
  try {
    const { id } = req.params;
    if (!isOid(id)) return res.status(400).json({ message: 'invalid id' });
    const user = await User.findByIdAndUpdate(id, { $pull: { roles: 'host' } }, { new: true });
    if (!user) return res.status(404).json({ message: 'user not found' });
    await writeAudit(req, { action: 'user.downgrade_from_host', target: { model: 'User', id } });
    return res.status(200).json({ message: 'host role removed', data: user });
  } catch (err) {
    return res.status(500).json({ message: 'internal_error', details: err?.message });
  }
};

const getUserBookings = async (req, res) => {
  try {
    const { id } = req.params;
    if (!isOid(id)) return res.status(400).json({ message: 'invalid id' });
    const { page, limit, skip, sort } = parsePagination(req.query);
    const filter = { guestId: id };
    if (req.query.status) filter.status = req.query.status;

    const [items, total] = await Promise.all([
      Booking.find(filter).populate('listingId', 'title imageUrls').sort(sort).skip(skip).limit(limit).lean(),
      Booking.countDocuments(filter),
    ]);
    return res.status(200).json({ data: items, pagination: buildPaginationMeta(total, page, limit) });
  } catch (err) {
    return res.status(500).json({ message: 'internal_error', details: err?.message });
  }
};

/* -------------------------------------------------------------------------- */
/* LISTINGS (admin views)                                                     */
/* -------------------------------------------------------------------------- */

const listListings = async (req, res) => {
  try {
    const { page, limit, skip, sort, q } = parsePagination(req.query);
    const filter = {};
    if (q) filter.$or = [
      { title:   { $regex: q, $options: 'i' } },
      { city:    { $regex: q, $options: 'i' } },
      { address: { $regex: q, $options: 'i' } },
    ];
    if (req.query.status) filter.status = req.query.status;
    if (req.query.hostId && isOid(req.query.hostId)) filter.hostId = req.query.hostId;
    if (req.query.city) filter.city = req.query.city;
    if (req.query.state) filter.state = req.query.state;
    if (req.query.minPrice || req.query.maxPrice) {
      filter.pricePerNight = {};
      if (req.query.minPrice) filter.pricePerNight.$gte = Number(req.query.minPrice);
      if (req.query.maxPrice) filter.pricePerNight.$lte = Number(req.query.maxPrice);
    }

    const [items, total] = await Promise.all([
      Listing.find(filter).populate('hostId', 'name email phone').sort(sort).skip(skip).limit(limit).lean(),
      Listing.countDocuments(filter),
    ]);
    return res.status(200).json({ data: items, pagination: buildPaginationMeta(total, page, limit) });
  } catch (err) {
    return res.status(500).json({ message: 'internal_error', details: err?.message });
  }
};

const getListingAdmin = async (req, res) => {
  try {
    const { id } = req.params;
    if (!isOid(id)) return res.status(400).json({ message: 'invalid id' });

    const listing = await Listing.findById(id).populate('hostId', 'name email phone').lean();
    if (!listing) return res.status(404).json({ message: 'listing not found' });

    const [bookingsCount, feedbackStats] = await Promise.all([
      Booking.countDocuments({ listingId: id }),
      Feedback.aggregate([
        { $match: { listing: new mongoose.Types.ObjectId(id) } },
        { $group: { _id: '$listing', avgRating: { $avg: '$rating' }, total: { $sum: 1 } } },
      ]),
    ]);

    return res.status(200).json({
      data: {
        listing,
        stats: {
          bookings: bookingsCount,
          avgRating: feedbackStats[0]?.avgRating || 0,
          totalReviews: feedbackStats[0]?.total || 0,
        },
      },
    });
  } catch (err) {
    return res.status(500).json({ message: 'internal_error', details: err?.message });
  }
};

const approveListing = async (req, res) => {
  try {
    const { id } = req.params;
    if (!isOid(id)) return res.status(400).json({ message: 'invalid id' });
    const listing = await Listing.findByIdAndUpdate(
      id,
      { $set: { status: 'approved', approvedAt: new Date(), approvedByAdminId: req.adminId }, $unset: { rejectionReason: '' } },
      { new: true },
    );
    if (!listing) return res.status(404).json({ message: 'listing not found' });
    await writeAudit(req, { action: 'listing.approve', target: { model: 'Listing', id } });
    return res.status(200).json({ message: 'approved', data: listing });
  } catch (err) {
    return res.status(500).json({ message: 'internal_error', details: err?.message });
  }
};

const rejectListing = async (req, res) => {
  try {
    const { id } = req.params;
    if (!isOid(id)) return res.status(400).json({ message: 'invalid id' });
    const { reason } = req.body || {};
    const listing = await Listing.findByIdAndUpdate(
      id,
      { $set: { status: 'rejected', rejectionReason: reason || '' } },
      { new: true },
    );
    if (!listing) return res.status(404).json({ message: 'listing not found' });
    await writeAudit(req, { action: 'listing.reject', target: { model: 'Listing', id }, payload: { reason } });
    return res.status(200).json({ message: 'rejected', data: listing });
  } catch (err) {
    return res.status(500).json({ message: 'internal_error', details: err?.message });
  }
};

const pauseListing = async (req, res) => {
  try {
    const { id } = req.params;
    if (!isOid(id)) return res.status(400).json({ message: 'invalid id' });
    const listing = await Listing.findByIdAndUpdate(id, { $set: { status: 'paused' } }, { new: true });
    if (!listing) return res.status(404).json({ message: 'listing not found' });
    await writeAudit(req, { action: 'listing.pause', target: { model: 'Listing', id } });
    return res.status(200).json({ message: 'paused', data: listing });
  } catch (err) {
    return res.status(500).json({ message: 'internal_error', details: err?.message });
  }
};

const activateListing = async (req, res) => {
  try {
    const { id } = req.params;
    if (!isOid(id)) return res.status(400).json({ message: 'invalid id' });
    const listing = await Listing.findByIdAndUpdate(id, { $set: { status: 'active' } }, { new: true });
    if (!listing) return res.status(404).json({ message: 'listing not found' });
    await writeAudit(req, { action: 'listing.activate', target: { model: 'Listing', id } });
    return res.status(200).json({ message: 'activated', data: listing });
  } catch (err) {
    return res.status(500).json({ message: 'internal_error', details: err?.message });
  }
};

/* -------------------------------------------------------------------------- */
/* BOOKINGS (admin views)                                                     */
/* -------------------------------------------------------------------------- */

const listBookings = async (req, res) => {
  try {
    const { page, limit, skip, sort } = parsePagination(req.query);
    const filter = {};
    if (req.query.status) filter.status = req.query.status;
    if (req.query.listingId && isOid(req.query.listingId)) filter.listingId = req.query.listingId;
    if (req.query.guestId && isOid(req.query.guestId)) filter.guestId = req.query.guestId;
    if (req.query.from || req.query.to) {
      filter.createdAt = {};
      if (req.query.from) filter.createdAt.$gte = new Date(req.query.from);
      if (req.query.to) filter.createdAt.$lte = new Date(req.query.to);
    }

    const [items, total] = await Promise.all([
      Booking.find(filter)
        .populate('listingId', 'title imageUrls city')
        .populate('guestId', 'name email phone')
        .sort(sort).skip(skip).limit(limit).lean(),
      Booking.countDocuments(filter),
    ]);
    return res.status(200).json({ data: items, pagination: buildPaginationMeta(total, page, limit) });
  } catch (err) {
    return res.status(500).json({ message: 'internal_error', details: err?.message });
  }
};

const getBookingAdmin = async (req, res) => {
  try {
    const { id } = req.params;
    if (!isOid(id)) return res.status(400).json({ message: 'invalid id' });
    const booking = await Booking.findById(id)
      .populate('listingId')
      .populate('guestId', 'name email phone')
      .lean();
    if (!booking) return res.status(404).json({ message: 'booking not found' });
    return res.status(200).json({ data: booking });
  } catch (err) {
    return res.status(500).json({ message: 'internal_error', details: err?.message });
  }
};

const cancelBookingByAdmin = async (req, res) => {
  try {
    const { id } = req.params;
    if (!isOid(id)) return res.status(400).json({ message: 'invalid id' });
    const { reason } = req.body || {};

    const booking = await Booking.findByIdAndUpdate(
      id,
      {
        $set: {
          status: 'cancelled_by_admin',
          cancellationReason: reason || '',
          cancelledAt: new Date(),
          cancelledByAdminId: req.adminId,
        },
      },
      { new: true },
    );
    if (!booking) return res.status(404).json({ message: 'booking not found' });

    await writeAudit(req, { action: 'booking.cancel', target: { model: 'Booking', id }, payload: { reason } });
    return res.status(200).json({ message: 'booking cancelled', data: booking });
  } catch (err) {
    return res.status(500).json({ message: 'internal_error', details: err?.message });
  }
};

/* -------------------------------------------------------------------------- */
/* PAYMENTS                                                                   */
/* -------------------------------------------------------------------------- */

const listPayments = async (req, res) => {
  try {
    const { page, limit, skip, sort } = parsePagination(req.query);
    const filter = {};
    if (req.query.status) filter.status = req.query.status;
    if (req.query.userId && isOid(req.query.userId)) filter.userId = req.query.userId;
    if (req.query.bookingId && isOid(req.query.bookingId)) filter.bookingId = req.query.bookingId;
    if (req.query.from || req.query.to) {
      filter.createdAt = {};
      if (req.query.from) filter.createdAt.$gte = new Date(req.query.from);
      if (req.query.to) filter.createdAt.$lte = new Date(req.query.to);
    }

    const [items, total] = await Promise.all([
      Payment.find(filter).populate('userId', 'name email phone').sort(sort).skip(skip).limit(limit).lean(),
      Payment.countDocuments(filter),
    ]);
    return res.status(200).json({ data: items, pagination: buildPaginationMeta(total, page, limit) });
  } catch (err) {
    return res.status(500).json({ message: 'internal_error', details: err?.message });
  }
};

const getPaymentAdmin = async (req, res) => {
  try {
    const { id } = req.params;
    if (!isOid(id)) return res.status(400).json({ message: 'invalid id' });
    const payment = await Payment.findById(id).populate('userId', 'name email phone').lean();
    if (!payment) return res.status(404).json({ message: 'payment not found' });
    return res.status(200).json({ data: payment });
  } catch (err) {
    return res.status(500).json({ message: 'internal_error', details: err?.message });
  }
};

const refundPayment = async (req, res) => {
  try {
    const { id } = req.params;
    if (!isOid(id)) return res.status(400).json({ message: 'invalid id' });
    const { amount, reason } = req.body || {};
    if (!amount || amount <= 0) return res.status(422).json({ message: 'amount required' });

    const payment = await Payment.findById(id);
    if (!payment) return res.status(404).json({ message: 'payment not found' });
    if (!payment.razorpayPaymentId) {
      return res.status(422).json({ message: 'payment has no razorpayPaymentId — cannot refund' });
    }

    const newRefunded = (payment.refundedAmount || 0) + Number(amount);
    if (newRefunded > payment.amount) {
      return res.status(422).json({ message: 'refund exceeds captured amount' });
    }

    // Call Razorpay first; only mutate local state if the gateway accepts.
    let refundResponse;
    try {
      refundResponse = await razorpayService.refundPayment({
        paymentId: payment.razorpayPaymentId,
        amountPaise: Number(amount),
        notes: { paymentId: String(payment._id), reason: reason || '', actorAdminId: String(req.adminId) },
        speed: 'normal',
      });
    } catch (err) {
      return res.status(502).json({ message: 'razorpay refund failed', details: err?.message });
    }

    payment.refundedAmount = newRefunded;
    payment.status = newRefunded === payment.amount ? 'refunded' : 'partially_refunded';
    payment.refunds.push({
      refundId: refundResponse.id,
      amount: Number(amount),
      reason: reason || '',
      status: refundResponse.status || 'initiated',
      processedByAdminId: req.adminId,
    });
    await payment.save();

    await writeAudit(req, { action: 'payment.refund', target: { model: 'Payment', id }, payload: { amount, reason, razorpayRefundId: refundResponse.id } });
    return res.status(200).json({ message: 'refund initiated', data: payment });
  } catch (err) {
    return res.status(500).json({ message: 'internal_error', details: err?.message });
  }
};

/* -------------------------------------------------------------------------- */
/* FEEDBACKS                                                                  */
/* -------------------------------------------------------------------------- */

const listFeedbacks = async (req, res) => {
  try {
    const { page, limit, skip, sort } = parsePagination(req.query);
    const filter = {};
    if (req.query.listingId && isOid(req.query.listingId)) filter.listing = req.query.listingId;
    if (req.query.userId && isOid(req.query.userId)) filter.user = req.query.userId;
    if (req.query.minRating) filter.rating = { ...(filter.rating || {}), $gte: Number(req.query.minRating) };
    if (req.query.maxRating) filter.rating = { ...(filter.rating || {}), $lte: Number(req.query.maxRating) };
    if (req.query.hasReview === 'true') filter.reviewText = { $exists: true, $nin: ['', null] };

    const [items, total] = await Promise.all([
      Feedback.find(filter)
        .populate('listing', 'title')
        .populate('user', 'name email')
        .sort(sort).skip(skip).limit(limit).lean(),
      Feedback.countDocuments(filter),
    ]);
    return res.status(200).json({ data: items, pagination: buildPaginationMeta(total, page, limit) });
  } catch (err) {
    return res.status(500).json({ message: 'internal_error', details: err?.message });
  }
};

const deleteFeedbackById = async (req, res) => {
  try {
    const { id } = req.params;
    if (!isOid(id)) return res.status(400).json({ message: 'invalid id' });
    const fb = await Feedback.findByIdAndDelete(id);
    if (!fb) return res.status(404).json({ message: 'feedback not found' });
    await writeAudit(req, { action: 'feedback.delete', target: { model: 'Feedback', id } });
    return res.status(200).json({ message: 'deleted', data: fb });
  } catch (err) {
    return res.status(500).json({ message: 'internal_error', details: err?.message });
  }
};

/* -------------------------------------------------------------------------- */
/* KYC                                                                        */
/* -------------------------------------------------------------------------- */

const listKyc = async (req, res) => {
  try {
    const { page, limit, skip, sort, q } = parsePagination(req.query);
    const filter = {};
    if (req.query.status) filter['meonKyc.status'] = req.query.status;
    if (q) filter.$or = [
      { name: { $regex: q, $options: 'i' } },
      { email: { $regex: q, $options: 'i' } },
      { phone: { $regex: q, $options: 'i' } },
    ];

    const [items, total] = await Promise.all([
      User.find(filter)
        .select('name email phone aadhaar face faceMatchPercent meonKyc.status meonKyc.completedAt')
        .sort(sort).skip(skip).limit(limit).lean(),
      User.countDocuments(filter),
    ]);
    return res.status(200).json({ data: items, pagination: buildPaginationMeta(total, page, limit) });
  } catch (err) {
    return res.status(500).json({ message: 'internal_error', details: err?.message });
  }
};

const getKycForUser = async (req, res) => {
  try {
    const { id } = req.params;
    if (!isOid(id)) return res.status(400).json({ message: 'invalid id' });
    const user = await User.findById(id).select('name email phone aadhaar face faceUrl faceMatchPercent meonKyc').lean();
    if (!user) return res.status(404).json({ message: 'user not found' });
    return res.status(200).json({ data: user });
  } catch (err) {
    return res.status(500).json({ message: 'internal_error', details: err?.message });
  }
};

const overrideKyc = async (req, res) => {
  try {
    const { id } = req.params;
    if (!isOid(id)) return res.status(400).json({ message: 'invalid id' });
    const { status, reason } = req.body || {};
    if (!['verified', 'failed'].includes(status)) {
      return res.status(422).json({ message: 'status must be verified or failed' });
    }
    const user = await User.findByIdAndUpdate(
      id,
      { $set: { 'meonKyc.status': status, 'meonKyc.completedAt': new Date() } },
      { new: true },
    ).select('meonKyc');
    if (!user) return res.status(404).json({ message: 'user not found' });

    await writeAudit(req, { action: 'kyc.override', target: { model: 'User', id }, payload: { status, reason } });
    return res.status(200).json({ message: 'kyc updated', data: user });
  } catch (err) {
    return res.status(500).json({ message: 'internal_error', details: err?.message });
  }
};

/* -------------------------------------------------------------------------- */
/* AUDIT LOG                                                                  */
/* -------------------------------------------------------------------------- */

const listAuditLogs = async (req, res) => {
  try {
    const { page, limit, skip, sort } = parsePagination(req.query);
    const filter = {};
    if (req.query.actorAdminId && isOid(req.query.actorAdminId)) filter.actorAdminId = req.query.actorAdminId;
    if (req.query.action) filter.action = req.query.action;
    if (req.query.targetModel) filter['target.model'] = req.query.targetModel;
    if (req.query.from || req.query.to) {
      filter.createdAt = {};
      if (req.query.from) filter.createdAt.$gte = new Date(req.query.from);
      if (req.query.to) filter.createdAt.$lte = new Date(req.query.to);
    }

    const [items, total] = await Promise.all([
      AuditLog.find(filter).populate('actorAdminId', 'email name role').sort(sort).skip(skip).limit(limit).lean(),
      AuditLog.countDocuments(filter),
    ]);
    return res.status(200).json({ data: items, pagination: buildPaginationMeta(total, page, limit) });
  } catch (err) {
    return res.status(500).json({ message: 'internal_error', details: err?.message });
  }
};

/* -------------------------------------------------------------------------- */
/* DASHBOARD                                                                  */
/* -------------------------------------------------------------------------- */

const dashboardOverview = async (req, res) => {
  try {
    const startOfMonth = dayjs().startOf('month').toDate();
    const startOfDay = dayjs().startOf('day').toDate();

    const [
      usersTotal, usersNewMonth,
      adminsTotal,
      listingsTotal, listingsActive, listingsPending, listingsRejected,
      bookingsTotal, bookingsPending, bookingsAccepted, bookingsRejected, bookingsToday,
      revenueAgg, revenueMonthAgg, revenueTodayAgg,
      reviewsAgg,
    ] = await Promise.all([
      User.countDocuments({ status: { $ne: 'deleted' } }),
      User.countDocuments({ createdAt: { $gte: startOfMonth } }),
      Admin.countDocuments({}),
      Listing.countDocuments({}),
      Listing.countDocuments({ status: 'active' }),
      Listing.countDocuments({ status: 'pending_review' }),
      Listing.countDocuments({ status: 'rejected' }),
      Booking.countDocuments({}),
      Booking.countDocuments({ status: 'pending' }),
      Booking.countDocuments({ status: 'accepted' }),
      Booking.countDocuments({ status: 'rejected' }),
      Booking.countDocuments({ createdAt: { $gte: startOfDay } }),
      Payment.aggregate([{ $match: { status: { $in: ['captured', 'partially_refunded'] } } }, { $group: { _id: null, total: { $sum: { $subtract: ['$amount', '$refundedAmount'] } } } }]),
      Payment.aggregate([{ $match: { status: { $in: ['captured', 'partially_refunded'] }, createdAt: { $gte: startOfMonth } } }, { $group: { _id: null, total: { $sum: { $subtract: ['$amount', '$refundedAmount'] } } } }]),
      Payment.aggregate([{ $match: { status: { $in: ['captured', 'partially_refunded'] }, createdAt: { $gte: startOfDay } } }, { $group: { _id: null, total: { $sum: { $subtract: ['$amount', '$refundedAmount'] } } } }]),
      Feedback.aggregate([{ $group: { _id: null, total: { $sum: 1 }, avg: { $avg: '$rating' } } }]),
    ]);

    return res.status(200).json({
      data: {
        users:    { total: usersTotal, newThisMonth: usersNewMonth },
        admins:   { total: adminsTotal },
        listings: { total: listingsTotal, active: listingsActive, pendingReview: listingsPending, rejected: listingsRejected },
        bookings: { total: bookingsTotal, pending: bookingsPending, accepted: bookingsAccepted, rejected: bookingsRejected, today: bookingsToday },
        revenue:  {
          totalInr: revenueAgg[0]?.total || 0,
          monthInr: revenueMonthAgg[0]?.total || 0,
          todayInr: revenueTodayAgg[0]?.total || 0,
        },
        reviews:  { total: reviewsAgg[0]?.total || 0, avgRating: reviewsAgg[0]?.avg || 0 },
      },
    });
  } catch (err) {
    return res.status(500).json({ message: 'internal_error', details: err?.message });
  }
};

export {
  // auth & self
  adminLogin, adminLogout, getMe, updateMe,
  // admins
  listAdmins, createAdmin, updateAdmin, deleteAdmin,
  // users
  getAllUsers, getUserById, updateUser, suspendUser, activateUser, deleteUser,
  upgradeToHost, downgradeFromHost, getUserBookings, createHost, updateHost,
  // listings
  listListings, getListingAdmin, approveListing, rejectListing, pauseListing, activateListing,
  // bookings
  listBookings, getBookingAdmin, cancelBookingByAdmin,
  // payments
  listPayments, getPaymentAdmin, refundPayment,
  // feedbacks
  listFeedbacks, deleteFeedbackById,
  // kyc
  listKyc, getKycForUser, overrideKyc,
  // audit + dashboard
  listAuditLogs, dashboardOverview,
};
