import mongoose from 'mongoose';

const favoriteSchema = new mongoose.Schema({
  wishlist: { type: mongoose.Schema.Types.ObjectId, ref: 'Wishlist', required: true },
  listing: { type: mongoose.Schema.Types.ObjectId, ref: 'Listing', required: true },
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },

}, { timestamps: true });


// No duplicate listing in same wishlist
favoriteSchema.index({ wishlist: 1, listing: 1 }, { unique: true });

// Fast check if user has favorited a listing anywhere
favoriteSchema.index({ user: 1, listing: 1 });


const Favorite = mongoose.model('Favorite', favoriteSchema);

export default Favorite;
