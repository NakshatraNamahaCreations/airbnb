import mongoose from 'mongoose';
import { AMENITIES, STATES } from '../constants/enums.js';

const ListingSchema = mongoose.Schema({
  hostId: { type: mongoose.Types.ObjectId, ref: 'User', required: true },
  title: { type: String, required: true },
  description: { type: String },
  imageUrls: { type: [String] },
  address: { type: String, required: true },
  amenities: { type: [String], enums: [AMENITIES], required: true },
  location: {
    type: { type: String, enum: ['Point'], default: 'Point' },
    coordinates: { type: [Number], index: '2dsphere' },    //(order [lng, lat])
  },
  pincode: { type: String, required: true },
  state: { type: String, enum: STATES, required: true },
  // basePriceCents: { type: Number, required: true },
  // currency: { type: String, default: 'INR' },
  status: { type: String, enum: ['active', 'paused', 'draft'], default: 'active' },
  rating: { type: String },
  isVerified: { type: Boolean, default: false },
  verificationStatus: { type: String, enum: ['pending', 'approved', 'rejected'], default: 'pending' },
  verificationReason: { type: String },
  maxOccupancy: { type: Number, required: true, default: 4 }, // max adults+children
  capacity: {
    adults: { type: Number, required: true, min: 1 },
    children: { type: Number, required: true, min: 0 },
    infants: { type: Number, required: true, min: 0 },
    pets: { type: Number, required: true, min: 0 },
  },
}, { timestamps: true });

ListingSchema.index({ location: '2dsphere' });

ListingSchema.pre('validate', function(next) {
  const totalGuests = this.capacity.adults + this.capacity.children;
  if (totalGuests > this.maxOccupancy) {
    return next(new Error(`Total guests (adults + children) cannot exceed ${this.maxOccupancy}.`));
  }
  next();
});


const Listing = mongoose.model('Listing', ListingSchema);

export default Listing;
