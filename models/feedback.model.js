import mongoose from 'mongoose';

const feedbackSchema = new mongoose.Schema({
  listingId: { type: mongoose.Schema.Types.ObjectId, ref: 'Listing', required: true },
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  rating: {
    type: Number,
    min: 1, // assuming rating is between 1 and 5
    max: 5,
    required: true,
  },
  reviewText: { type: String, required: true },
  createdAt: { type: Date, default: Date.now },
});

const Feedback = mongoose.model('Feedback', feedbackSchema);

export default Feedback;
