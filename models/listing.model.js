import mongoose from 'mongoose';
import { AMENITIES, STATES } from '../constants/enums.js';

const listingSchema = new mongoose.Schema({
  hostId: { type: mongoose.Types.ObjectId, ref: 'Admin', required: true },
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
  maxGuests: { type: Number, required: true },

  capacity: {
    adults: { type: Number, required: true, min: 1 },
    children: { type: Number, required: true, min: 0 },
    infants: { type: Number, required: true, min: 0 },
    pets: { type: Number, required: true, min: 0 },
  },

  // rating: { type: Number },

  houseRules: { type: [String], default: [] },
  safetyAndProperty: { type: [String], default: [] },

  status: { type: String, enum: ['active', 'paused', 'draft'], default: 'active' },
  // isVerified: { type: Boolean, default: false },
  // verificationStatus: { type: String, enum: ['pending', 'approved', 'rejected'], default: 'pending' },
  // verificationReason: { type: String },
}, { timestamps: true });

listingSchema.index({ location: '2dsphere' });

listingSchema.pre('validate', function(next) {
  const totalGuests = this.capacity.adults + this.capacity.children;
  if (totalGuests > this.maxGuests) {
    return next(new Error(`Total guests (adults + children) cannot exceed ${this.maxGuests}.`));
  }
  next();
});

const Listing = mongoose.model('Listing', listingSchema);
export default Listing;
