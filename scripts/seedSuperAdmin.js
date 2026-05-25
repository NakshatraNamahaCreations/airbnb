/**
 * One-off script to create a super-admin.
 *
 * Usage (PowerShell):
 *   $env:SEED_ADMIN_EMAIL='you@x.com'; $env:SEED_ADMIN_PASSWORD='S3cret!'; node scripts/seedSuperAdmin.js
 *
 * Usage (bash):
 *   SEED_ADMIN_EMAIL=you@x.com SEED_ADMIN_PASSWORD='S3cret!' node scripts/seedSuperAdmin.js
 *
 * Optional: SEED_ADMIN_NAME, SEED_ADMIN_PHONE, SEED_ADMIN_ROLE (defaults to super_admin)
 */
import dotenv from 'dotenv';
import bcrypt from 'bcryptjs';
import { connectDB } from '../config/db.js';
import Admin from '../models/admin.model.js';

dotenv.config();

const run = async () => {
  const email = process.env.SEED_ADMIN_EMAIL;
  const password = process.env.SEED_ADMIN_PASSWORD;
  const name = process.env.SEED_ADMIN_NAME || 'Super Admin';
  const phone = process.env.SEED_ADMIN_PHONE || '';
  const role = process.env.SEED_ADMIN_ROLE || 'super_admin';

  if (!email || !password) {
    console.error('SEED_ADMIN_EMAIL and SEED_ADMIN_PASSWORD env vars are required');
    process.exit(1);
  }

  await connectDB();

  const existing = await Admin.findOne({ email });
  if (existing) {
    console.log(`Admin already exists: ${email} (role=${existing.role}). Nothing to do.`);
    process.exit(0);
  }

  const passwordHash = await bcrypt.hash(String(password), 10);
  const admin = await Admin.create({ email, password: passwordHash, name, phone, role });

  console.log(`Created admin: ${admin.email} (role=${admin.role}, _id=${admin._id})`);
  process.exit(0);
};

run().catch((err) => {
  console.error('Seed failed:', err);
  process.exit(1);
});
