import mongoose from 'mongoose';
import Feedback from '../models/feedback.model.js';
import Listing from '../models/listing.model.js';
import { NotFoundError } from '../utils/error.js';

// Add or update feedback (rating + review)
const addFeedback = async(req, res) => {
  try {
    const { listingId } = req.params;
    const { rating, reviewText } = req.body;
    const { userId } = req;

    const listing = await Listing.findById(listingId);
    if (!listing) throw new NotFoundError('Listing not found');

    const newFeedback = await Feedback.findOneAndUpdate(
      { user: userId, listing: listingId },
      { rating: parseInt(rating), reviewText },
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
const getFeedbacks = async(req, res) => {
  try {
    const { listingId } = req.params;

    const feedbacks = await Feedback.find({ listing: listingId })
      .populate('user', 'name')
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
      { $match: { listing: new mongoose.Types.ObjectId(listingId) } },
      { $group: { _id: '$listing', avgRating: { $avg: '$rating' }, total: { $sum: 1 } } },
    ]);

    res.status(200).json(
      result[0] || { avgRating: 0, total: 0 },
    );
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};


/*
* if feedback doesnt exist im creating it
*/
const updateFeedback = async(req, res) => {
  try {
    const { listingId } = req.params;
    const { rating, reviewText } = req.body;
    const { userId } = req;

    const filter = {};

    if (rating) filter.rating = parseInt(rating);
    if (reviewText) filter.reviewText = reviewText;

    console.log('filter: ', filter);

    const listing = await Listing.findById(listingId);
    if (!listing) throw new NotFoundError('Listing not found');

    const newFeedback = await Feedback.findOneAndUpdate(
      { user: userId, listing: listingId },
      // { rating: parseInt(rating), reviewText },
      filter,
      { upsert: true, new: true, setDefaultsOnInsert: true },
    );

    res.status(200).json({
      message: 'Feedback added/updated successfully',
      data: newFeedback,
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

const deleteFeedback = async(req, res) => {
  try {
    const { listingId } = req.params;
    const { userId } = req;

    const listing = await Listing.findById(listingId);
    if (!listing) throw new NotFoundError('Listing not found');

    const newFeedback = await Feedback.findOneAndDelete(
      { user: userId, listing: listingId },
    );

    res.status(200).json({
      message: 'Feedback deleted successfully',
      data: newFeedback,
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

export { addFeedback, getFeedbacks, getListingAverageRating, updateFeedback, deleteFeedback };
