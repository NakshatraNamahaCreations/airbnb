import mongoose from 'mongoose';

const userSchema = mongoose.Schema({
  phone: { type: String, unique: true, required: true },
  email: { type: String, unique: true },
  password: { type: String },  // this is only added fr damin password login. u can remove it later if u want
  name: { type: String, required: false },
  dateOfBirth: { type: Date, required: false },
  // Role system
  roles: { type: [String], enum: ['guest', 'host', 'admin'], default: 'guest' },
  // listings: [{ type: mongoose.Types.ObjectId, ref: 'Listing' }],
  // collections: [{
  //   type: mongoose.Schema.Types.ObjectId,
  //   ref: 'Listing',    // Assuming "Listing" is another model representing saved listings
  // }],
  profile: {
    age: { type: Number },
    gender: { type: String },
    location: { type: String }, // Optional, for additional profile info if needed
    // Add more fields based on your needs, such as phone number, bio, etc.
  },
  preferences: { type: Map, of: String, default: {} }, // guest personal prefs
  recentlyViewed: [
    {
      listing: { type: mongoose.Schema.Types.ObjectId, ref: 'Listing' },
      viewedAt: { type: Date, default: Date.now },
    },
  ],

  // Host-specific fields
  hostProfile: {
    // isHost: { type: Boolean, default: false },   //redundant maybe cz we already ve roles[]
    // listings: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Listing' }],
    // other host-specific info like payout details
    payoutDetails: {
      bankName: String,
      accountNumber: String,
      ifsc: String,
    },
    documents: [String], // e.g., ID proof, property verification
    wishlistIds: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Wishlist' }],  // enforce max 10–20
  },
}, { timestamps: true },
);

// userSchema.set('toJSON', {
//   virtuals: true,
//   versionKey: false, // drops __v
//   transform: (_, ret) => {
//     ret.id = String(ret._id);
//     delete ret._id;
//   }
// });

// userSchema.virtual('isHostReady').get(function () {
//   // return this.roles?.includes('host') && this.hostProfile?.status === 'approved';
//   return true;
// });


// userSchema.set('toObject', { virtuals: true, versionKey: false });


const User = mongoose.model('User', userSchema);

export default User;
