import mongoose from 'mongoose';

const favoriteSchema = new mongoose.Schema({
  collectionId: { type: mongoose.Schema.Types.ObjectId, ref: 'Collection', required: true },
  listingId: { type: mongoose.Schema.Types.ObjectId, ref: 'Listing', required: true },
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true }, // ✅ new

}, { timestamps: true });


// No duplicate listing in same collection
favoriteSchema.index({ collectionId: 1, listingId: 1 }, { unique: true });

// Fast check if user has favorited a listing anywhere
favoriteSchema.index({ user: 1, listingId: 1 });


const Favorite = mongoose.model('Favorite', favoriteSchema);

export default Favorite;
