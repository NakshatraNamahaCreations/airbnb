import mongoose from 'mongoose';

const adminSchema = mongoose.Schema({
  email: { type: String, unique: true, required: true },
  password: { type: String, required: true },
  phone: { type: String },
  name: { type: String, required: false },
  role: {
    type: String,
    enum: ['super_admin', 'admin', 'support'],
    default: 'admin',
    required: true,
  },
  status: {
    type: String,
    enum: ['active', 'suspended'],
    default: 'active',
  },
  lastLoginAt: { type: Date },
}, { timestamps: true });

const Admin = mongoose.model('Admin', adminSchema);

export default Admin;
