import asyncHandler from '../middlewares/asynchandler.js';
import { AuthError, NotFoundError } from '../utils/error.js';
import { apiLogger } from '../utils/logger.js';
import Listing from '../models/listing.model.js';
import Wishlist from '../models/wishlist.model.js';
import User from '../models/user.model.js';
import mongoose from 'mongoose';
import Booking from '../models/booking.model.js';
import Favorite from '../models/favorite.model.js';





const registerListing = asyncHandler(async(req, res) => {
  const { userId } = req;
  const {
    title,
    description,
    imageUrls = [],
    addressLine,
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
    addressLine,
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
    addressLine,
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

const getListings = asyncHandler(async(req, res) => {
  const { userId } = req;

  const listings = await Listing.find().lean();

  // listings.map((listing) => {
  //   listing.rating = (Math.random() * 5).toFixed(1);  // Random rating between 0 and 5, rounded to 1 decimal
  // });

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
  const { searchQuery, checkInDate, checkOutDate, location } = req.body;
  const { latitude, longitude, radius = 3000 } = location;

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

  console.log({ longitude, latitude });
  console.log('parsed long: ', parseFloat(longitude), 'parsed lat: ', parseFloat(latitude));
  console.log('typeof userId:', typeof userId, userId);

  const fav = await Favorite.findOne({ listing: '68b935cc8ddf57fc8ec805a0', user: '68afe4a19200e5d00c4e1d81' });
  console.log('Direct favorite check:', fav);


  const nearbyListings = await Listing.aggregate([{
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

  const pipeline = [{
    $geoNear: {
      near: {
        type: 'Point',
        coordinates: [parseFloat(longitude), parseFloat(latitude)], // [lng, lat]
        // coordinates: [78.4345, 17.4126], // [lng, lat]
      },
      distanceField: 'distance',
      maxDistance: parseInt(radius), // in meters
      // maxDistance: 3000, // in meters
      spherical: true,
      query: filter, // apply your filter conditions here
    },
  }, {
    $lookup: {
      from: 'favorites',                // wishlist name in MongoDB
      let: { listingId: '$_id' },       // pass current listingId
      pipeline: [
        {
          $match: {
            $expr: {
              $and: [
                { $eq: ['$listing', '$$listingId'] },
                // { $eq: ['$user', new mongoose.Types.ObjectId(userId)] }, // current logged-in user
                { $eq: ['$user', userId] }, // current logged-in user
                // { $eq: ['$user', { $toObjectId: userId.toString() }] }
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
      title: 1,
      // state: 1,
      address: 1,
      pricePerNight: 1,
      rating: 1,
      imageUrls: { $arrayElemAt: ['$imageUrls', 0] },
      distance: 1, // include calculated distance
      isFavorited: 1,
    },
  }];

  const listings = await Listing.aggregate(pipeline);



  // listings.map((listing) => {
  //   listing.rating = (Math.random() * 5).toFixed(1);  // Random rating between 0 and 5, rounded to 1 decimal
  // });

  console.log('listings: ', listings);


  res.status(200).json({
    message: 'searchListings',
    count: listings.length,
    // data: { listings, nearbyListings },
    data: nearbyListings,
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
    checkOutDate: { $gt: today },
  }).lean();

  // Map to array of blocked date ranges
  const blockedDates = blockedBookings.map((item) => ({
    checkInDate: item.checkInDate,
    checkOutDate: item.checkOutDate,
    status: item.status, // always 'accepted'
  }));

  // listing.rating = (Math.random() * 5).toFixed(1);  // Random rating between 0 and 5, rounded to 1 decimal
  // console.log(`listing: `, listing);

  res.status(200).json({
    message: 'Listing fetched successfully',
    data: {
      listing,
      availability,
      blockedDates,
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
  //   user.recentlyViewed.map(async (item) => {
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

  const updated = await Listing.findByIdAndUpdate(
    id,
    { $set: req.body },   // only update provided fields
    { new: true, runValidators: true }, // return updated doc + validate
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

export { registerListing, getMyListings, getListings, getListing, recentlyViewed, getNearbyListings, updateListing, deleteListing, searchListings };
