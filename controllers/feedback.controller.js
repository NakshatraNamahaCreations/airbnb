import mongoose from 'mongoose';
import Feedback from '../models/feedback.model.js';
import Listing from '../models/listing.model.js';

// Add or update feedback (rating + review)
const addRating = async(req, res) => {
  try {
    const { listingId } = req.params;
    const { rating, reviewText } = req.body;
    const { userId } = req;

    const newFeedback = await Feedback.findOneAndUpdate(
      { userId: userId, listingId: listingId },
      { rating, reviewText },
      { upsert: true, new: true, setDefaultsOnInsert: true },
    );

    res.status(201).json({
      message: 'Feedback added/updated successfully',
      data: newFeedback,
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// Get all feedback for a listing
const getListingRatings = async(req, res) => {
  try {
    const { listingId } = req.params;

    const feedbacks = await Feedback.find({ listingId: listingId })
      .populate('userId', 'name')
      .sort({ createdAt: -1 });

    res.status(200).json({
      message: 'Feedback fetched successfully',
      count: feedbacks.length,
      data: feedbacks,
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// Get average rating of a listing
const getListingAverageRating = async(req, res) => {
  try {
    const { listingId } = req.params;

    const result = await Feedback.aggregate([
      { $match: { listingId: new mongoose.Types.ObjectId(listingId) } },
      { $group: { _id: '$listingId', avgRating: { $avg: '$rating' }, total: { $sum: 1 } } },
    ]);

    res.status(200).json(
      result[0] || { avgRating: 0, total: 0 },
    );
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

export { addRating, getListingRatings, getListingAverageRating };
