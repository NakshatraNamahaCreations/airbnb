import mongoose from 'mongoose';
import { AMENITIES, STATES } from '../constants/enums.js';

const LISTING_STATUS = ['active', 'paused', 'draft', 'pending_review', 'approved', 'rejected'];

const listingSchema = new mongoose.Schema({
  hostId: { type: mongoose.Types.ObjectId, ref: 'User', required: true },
  createdByAdminId: { type: mongoose.Types.ObjectId, ref: 'Admin' },
  title: { type: String, required: true },
  description: { type: String },

  imageUrls: { type: [String], default: [] },

  address: { type: String, required: true },
  city: { type: String, required: true },
  state: { type: String, enum: STATES, required: true },
  pincode: { type: String, required: true },

  amenities: { type: [String], enum: AMENITIES, default: [] },

  location: {
    type: { type: String, enum: ['Point'], default: 'Point' },
    coordinates: { type: [Number] }, // [lng, lat]
  },

  pricePerNight: { type: Number, required: true, min: 0 },
  currency: { type: String, default: 'INR' },

  bedrooms: { type: Number, required: true, min: 1 },

  // Single shared limit: adults + children must not exceed maxGuests.
  // Infants and pets are tracked separately and do NOT count toward maxGuests.
  maxGuests: { type: Number, required: true, min: 1 },
  maxInfants: { type: Number, default: 0, min: 0 },
  maxPets: { type: Number, default: 0, min: 0 },

  houseRules: { type: [String], default: [] },
  safetyAndProperty: { type: [String], default: [] },

  status: { type: String, enum: LISTING_STATUS, default: 'active', index: true },
  rejectionReason: { type: String },
  approvedAt: { type: Date },
  approvedByAdminId: { type: mongoose.Types.ObjectId, ref: 'Admin' },
}, { timestamps: true });

listingSchema.index({ location: '2dsphere' });

const Listing = mongoose.model('Listing', listingSchema);
export { LISTING_STATUS };
export default Listing;
