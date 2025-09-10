import mongoose from 'mongoose';

const SuggestionSchema = new mongoose.Schema({
  place: { type: String, required: true, trim: true },
  location: {
    type: { type: String, enum: ['Point'], default: 'Point' },
    coordinates: { type: [Number] },
  },
  imageUrl: { type: String, trim: true },
  isActive: { type: Boolean, default: true },
  meta: {
    type: Map,
    of: String,
    default: {},
  },
}, { timestamps: true });

SuggestionSchema.index({ location: '2dsphere' });

const Suggestion = mongoose.model('Suggestion', SuggestionSchema);

export default Suggestion;
