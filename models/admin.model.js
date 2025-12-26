import mongoose from 'mongoose';

const adminSchema = mongoose.Schema({
  email: { type: String, unique: true },
  password: { type: String },
  phone: { type: String },
  name: { type: String, required: false },

}, { timestamps: true },
);

const Admin = mongoose.model('Admin', adminSchema);

export default Admin;
