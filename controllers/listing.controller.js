import asyncHandler from '../middlewares/asyncHandler.js';
import { AuthError, NotFoundError } from '../utils/error.js';
import { apiLogger } from '../utils/logger.js';
import Listing from '../models/listing.model.js';
import Wishlist from '../models/wishlist.model.js';
import User from '../models/user.model.js';
import mongoose from 'mongoose';
import Booking from '../models/booking.model.js';
import Favorite from '../models/favorite.model.js';
import Feedback from '../models/feedback.model.js';
import dayjs from 'dayjs';





const registerListing = asyncHandler(async(req, res) => {
  const { userId } = req;
  const {
    title,
    description,
    imageUrls = [],
    address,
    city,
    state,
    pincode,
    pricePerNight,
    currency = 'INR',
    bedrooms,
    maxGuests,
    capacity = {},
    amenities = [],
    location = {},
    houseRules = [],
    safetyAndProperty = [],
  } = req.body;

  console.log({
    title,
    description,
    imageUrls,
    address,
    city,
    state,
    pincode,
    pricePerNight,
    currency,
    bedrooms,
    maxGuests,
    capacity,
    amenities,
    location,
    houseRules,
    safetyAndProperty,
  });

  const newListing = new Listing({
    hostId: userId,
    title,
    description,
    imageUrls,
    address,
    city,
    state,
    pincode,
    pricePerNight,
    currency,
    bedrooms,
    maxGuests,
    capacity,
    rating: (Math.random() * 5).toFixed(1),
    amenities,
    location,
    houseRules,
    safetyAndProperty,
  });

  await newListing.save();

  res.status(201).json({ message: 'Listing created successfully', listing: newListing });
});

const getMyListings = asyncHandler(async(req, res) => {
  const { userId } = req;

  const listings = await Listing.find({ hostId: userId }).lean();


  res.status(200).json({
    message: 'host listings',
    data: {
      count: listings.length,
      listings,
    },
  });

});

const getAllListings = asyncHandler(async(req, res) => {
  const { userId } = req;

  const listings = await Listing.find().lean();

  res.status(200).json({
    message: 'host listings',
    data: {
      count: listings.length,
      listings,
    },
  });

});

// if (searchQuery && searchQuery.trim() !== '') {
//   const searchQueryTrimmed = searchQuery.trim();
//   // Example: add basic title/address regex search later if needed
//   filter.$or = [
//     { title: { $regex: searchQueryTrimmed, $options: 'i' } },
//     { address: { $regex: searchQueryTrimmed, $options: 'i' } },
//   ];
// }

// if (state) {
//   filter.state = state;
// }

const searchListings = asyncHandler(async(req, res) => {
  const { userId } = req;
  const { searchQuery, checkInDate, checkOutDate, location, guests } = req.body;
  const { latitude, longitude, radius = 3000 } = location;
  const { page = 1, limit = 10 } = req.query; // or req.body
  const skip = (page - 1) * limit;


  let filter = {};

  // If dates provided, exclude listings that are blocked/fully_booked/maintenance overlapping those dates
  if (checkInDate && checkOutDate) {
    const start = new Date(checkInDate);
    const end = new Date(checkOutDate);

    // const blockingStatuses = ['fully_booked', 'blocked', 'maintenance'];

    const blocked = await Booking.find({
      // status: { $in: blockingStatuses },
      checkInDate: { $lte: end },
      checkOutDate: { $gte: start },
    }).distinct('listingId');

    if (blocked.length > 0) {
      filter._id = { $nin: blocked };
    }
  }

  const { adults = 0, children = 0, infants = 0, pets = 0 } = guests || {};
  const totalGuests = adults + children;

  if (adults > 0) filter['capacity.adults'] = { $gte: adults };
  if (children > 0) filter['capacity.children'] = { $gte: children };
  if (infants > 0) filter['capacity.infants'] = { $gte: infants };
  if (pets > 0) filter['capacity.pets'] = { $gte: pets };
  if (totalGuests > 0) filter.maxGuests = { $gte: totalGuests };


  console.log({ longitude, latitude });
  // console.log('parsed long: ', parseFloat(longitude), 'parsed lat: ', parseFloat(latitude));
  // console.log('typeof userId:', typeof userId, userId);


  const pipeline = [{
    $geoNear: {
      near: {
        type: 'Point',
        coordinates: [parseFloat(longitude), parseFloat(latitude)],
      },
      distanceField: 'distance',
      maxDistance: parseInt(radius), // in meters
      spherical: true,
      query: filter, // apply your filter conditions here
    },
  }, {
    $lookup: {
      from: 'favorites',
      let: { listingId: '$_id' },       // pass current listingId
      pipeline: [
        {
          $match: {
            $expr: {
              $and: [
                { $eq: ['$listing', '$$listingId'] },
                { $eq: ['$user', new mongoose.Types.ObjectId(userId)] },
              ],
            },
          },
        },
      ],
      as: 'favorites',
    },
  }, {
    $addFields: {
      isFavorited: { $gt: [{ $size: '$favorites' }, 0] }, // true if any favorite exists
    },
  },
  {
    $project: {
      capacity: 1,
      maxGuests: 1,
      title: 1,
      // state: 1,
      address: 1,
      pricePerNight: 1,
      rating: 1,
      location: 1,
      imageUrls: { $arrayElemAt: ['$imageUrls', 0] },
      distance: 1,
      isFavorited: 1,
    },
  }];

  const listings = await Listing.aggregate(pipeline);



  res.status(200).json({
    message: 'searchListings',
    count: listings.length,
    data: listings,
  });
});

const getListing = asyncHandler(async(req, res) => {
  const { userId } = req;
  const { id } = req.params;
  const { checkInDate, checkOutDate } = req.query;


  if (!mongoose.Types.ObjectId.isValid(id)) {
    throw new NotFoundError('Invalid ID');
  }

  const listing = await Listing.findById(id).lean();

  if (!listing) {
    throw new NotFoundError('listing doesnt exist');
  }

  const user = await User.findByIdAndUpdate(userId, {
    $pull: { recentlyViewed: { listing: id } },
  });

  // Add the listing back to the recentlyViewed array with the current date
  await User.findByIdAndUpdate(userId, {
    $push: { recentlyViewed: { listing: id, viewedAt: new Date() } },  // Add with timestamp
  });

  // Optional: Limit the array size to 10 (or any max limit you want)
  const maxRecentlyViewed = 10;
  if (user.recentlyViewed.length > maxRecentlyViewed) {
    user.recentlyViewed.pop();  // Remove the oldest listing (at the end of the array)
    await user.save();
  }

  // const feedbackStats = await Feedback.aggregate([
  //   { $match: { listing: new mongoose.Types.ObjectId(id) } },

  //   {
  //     $group: {
  //       _id: "$listing",
  //       avgRating: { $avg: "$rating" },              // average rating
  //       totalRatings: { $sum: 1 },                   // count all feedbacks
  //       totalReviews: {
  //         $sum: {
  //           $cond: [
  //             { $and: [ { $ifNull: ["$reviewText", false] }, { $ne: ["$reviewText", ""] } ] },
  //             1,
  //             0
  //           ]
  //         }
  //       }
  //     }
  //   }
  // ]);

  // // Get reviews separately (only those with reviewText)
  // const reviews = await Feedback.find({
  //   listing: id,
  //   reviewText: { $exists: true, $ne: "" }
  // })
  //   .populate("user", "name avatar") // optional
  //   .lean();

  // console.log(`feedbacks: `, feedbackStats);


  // Optional availability check for single-unit listings
  let availability = undefined;
  if (checkInDate && checkOutDate) {
    const start = new Date(checkInDate);
    const end = new Date(checkOutDate);
    // Only 'accepted' bookings block dates
    const overlapCount = await Booking.countDocuments({
      listingId: id,
      status: 'accepted',
      checkInDate: { $lt: end },
      checkOutDate: { $gt: start },
    });

    availability = overlapCount === 0;
  }

  // Fetch blocked bookings for the next 3 months starting today
  const today = new Date();
  const threeMonthsLater = new Date();
  threeMonthsLater.setMonth(today.getMonth() + 3);

  // Find accepted bookings for this listing in the next 3 months
  const blockedBookings = await Booking.find({
    listingId: id,
    status: 'accepted',
    checkInDate: { $lt: threeMonthsLater },
    checkOutDate: { $gte: today },
  }).lean();

  // console.log('blockedBookings: ', blockedBookings);

  // Map to array of blocked date ranges
  const blockedDates = blockedBookings.map((item) => ({
    checkInDate: item.checkInDate,
    checkOutDate: item.checkOutDate,
    status: item.status, // always 'accepted'
  }));


  const favorite = await Favorite.find({
    listing: id,
    user: userId,
  }).lean();


  const isFavorited = (favorite.length > 0) ? true : false;

  // ✅ Feedback aggregation
  const stats = await Feedback.aggregate([
    { $match: { listing: new mongoose.Types.ObjectId(id) } },
    {
      $group: {
        _id: '$listing',
        avgRating: { $avg: '$rating' },
        totalReviews: {
          $sum: {
            $cond: [
              { $and: [{ $ifNull: ['$reviewText', false] }, { $ne: ['$reviewText', ''] }] },
              1,
              0,
            ],
          },
        },
        totalRatings: { $sum: 1 },
      },
    },
  ]);

  const feedbackSummary =
    stats[0] || { avgRating: 0, totalRatings: 0, totalReviews: 0 };

  // ✅ Top 10 reviews by rating (then newest among ties)
  const topReviews = await Feedback.find({
    listing: id,
    reviewText: { $exists: true, $ne: '' },
  })
    .sort({ rating: -1, createdAt: -1 })
    .limit(5)
    .populate('user', 'name createdAt') // optional
    .lean();

  // console.log('topReviews: ', topReviews);


  res.status(200).json({
    message: 'Listing fetched successfully',
    data: {
      listing,
      isFavorited,
      availability,
      blockedDates,
      feedbackSummary, // { avgRating, totalRatings, totalReviews }
      topReviews,
    },
  });
});

const recentlyViewed = asyncHandler(async(req, res) => {
  const { userId } = req;

  // const user = await User.findById(userId).lean();
  const user = await User.findById(userId)
    .populate('recentlyViewed.listing') // populate listing docs
    .lean();

  console.log('user: ', user);


  // // populate recentviewed with listing
  // user.recentlyViewed = await Promise.all(
  //   user.recentlyViewed.map(async(item) => {
  //     const listing = await Listing.findById(item.listing).lean();
  //     return { ...item, listing };
  //   }),
  // );

  if (user && user.recentlyViewed) {
    // Sort the recentlyViewed array by viewedAt (latest viewed first)
    user.recentlyViewed.sort((a, b) => new Date(b.viewedAt) - new Date(a.viewedAt));
  }

  res.status(200).json({
    message: 'Recently viewed',
    count: user.recentlyViewed.length,
    data: user.recentlyViewed,
  });
});



// Get all listings near a user (or a given location)
const getNearbyListings = asyncHandler(async(req, res) => {
  const { latitude, longitude, radius } = req.query; // Radius in meters

  const nearbyListings = await Listing.aggregate([
    {
      $geoNear: {
        near: {
          type: 'Point',
          coordinates: [parseFloat(longitude), parseFloat(latitude)], // Search from these coordinates
        },
        distanceField: 'distance', // Field to store the calculated distance
        maxDistance: parseInt(radius), // Limit the search by radius (in meters)
        spherical: true, // Use spherical geometry for accurate distance calculation
      },
    },
  ]);

  apiLogger.info('getNearbyListings: ');

  res.status(200).json(nearbyListings);

});

const updateListing = asyncHandler(async(req, res) => {
  const { id } = req.params;

  if (!mongoose.Types.ObjectId.isValid(id)) {
    throw new NotFoundError('Invalid ID');
  }

  const allowedUpdates = [
    'title',
    'description',
    'imageUrls',
    'address',
    'city',
    'state',
    'pincode',
    'amenities',
    'location',
    'pricePerNight',
    'currency',
    'bedrooms',
    'maxGuests',
    'capacity',
    'rating',
    'houseRules',
    'safetyAndProperty',
    'status',
  ];

  const updateData = {};
  for (const key of allowedUpdates) {
    if (req.body[key] !== undefined) {
      updateData[key] = req.body[key];
    }
  }


  const updated = await Listing.findByIdAndUpdate(
    id,
    { $set: updateData },
    { new: true, runValidators: true },
  );

  if (!updated) {
    return res.status(404).json({ message: 'Listing not found' });
  }

  res.status(200).json({
    message: 'Listing updated successfully',
    data: updated,
  });

});

const deleteListing = asyncHandler(async(req, res) => {
  const { id } = req.params;

  if (!mongoose.Types.ObjectId.isValid(id)) {
    throw new NotFoundError('Invalid ID');
  }

  const deletedListing = await Listing.findByIdAndDelete(id).lean();

  console.log('deletedListing: ', deletedListing);

  res.status(200).json({
    message: 'Listing deleted successfully',
    data: deletedListing,
  });
});

export { registerListing, getMyListings, getAllListings, getListing, recentlyViewed, getNearbyListings, updateListing, deleteListing, searchListings };
