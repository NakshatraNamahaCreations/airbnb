import mongoose from 'mongoose';

const featuredAreaSchema = new mongoose.Schema({
  name: { type: String, required: true },
  location: {
    type: { type: String, enum: ['Point'], default: 'Point' },
    coordinates: { type: [Number], required: true },
  },
  radiusKm: { type: Number, default: 3 },
  imageUrl: String,
}, { timestamps: true });

featuredAreaSchema.index({ location: '2dsphere' });

const FeaturedArea = mongoose.model('FeaturedArea', featuredAreaSchema);

export default FeaturedArea;
