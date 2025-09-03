import asyncHandler from '../middlewares/asynchandler.js';
import { AuthError, NotFoundError } from '../utils/error.js';
import { apiLogger } from '../utils/logger.js';
import Listing from '../models/listing.model.js';
import Collection from '../models/collection.model.js';
import User from '../models/user.model.js';
import mongoose from 'mongoose';





const registerListing = asyncHandler(async(req, res) => {
  const { userId } = req;
  const { title, description, imageUrls, address, amenities, location, pincode, state } = req.body;
  console.log({ title, description, imageUrls, address, amenities, location, pincode, state });


  const newListing = new Listing({
    hostId: userId,
    title,
    description,
    location,
    imageUrls,
    address,
    amenities,
    pincode,
    state,
  });

  await newListing.save();

  res.status(201).json({ message: 'Listing created successfully', listing: newListing });
});





const getMyListings = asyncHandler(async(req, res) => {
  const { userId } = req;

  const listings = await Listing.find({ hostId: userId }).lean();


  res.status(200).json({
    message: 'host listings',
    data: listings,
  });

});


const searchListings = asyncHandler(async(req, res) => {
  const { userId } = req;
  const { searchQuery, checkInDate, checkOutDate, state, adults } = req.query;
  console.log({ searchQuery, checkInDate, checkOutDate, state, adults });

  let filter = {};

  if (searchQuery && searchQuery.trim() !== '') {
    const searchQueryTrimmed = searchQuery.trim().toLowerCase();

    // filter.$or =  [
    //   { title: { $regex: searchQueryTrimmed, $options: 'i' } },
    //   { description: { $regex: searchQueryTrimmed, $options: 'i' } },
    //   // { "location.address": { $regex: searchQueryTrimmed, $options: "i" } },
    //   // { "location.city": { $regex: searchQueryTrimmed, $options: "i" } },
    // ];

    // state filter
  }

  if (state) {
    filter.state = state; // since it's enum-safe
  }

  const listings = await Listing.find(filter).select('title state address').lean();

  res.status(200).json({
    message: 'searchListings',
    count: listings.length,
    data: listings,
  });

});

const getListing = asyncHandler(async(req, res) => {
  const { userId } = req;
  const { id } = req.params;


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

  await User.findByIdAndUpdate(
    userId,
    {
      $push: {
        recentlyViewed: {
          $each: [{ listing: id, viewedAt: new Date() }],
          $position: 0,
          $slice: 20,
        },
      },
    },
    { new: true },
  );


  if (!user) {
    throw new NotFoundError('User doesn\'t exist');
  }


  res.status(200).json({
    message: 'Listing fetched successfully',
    data: listing,
  });

});

const recentlyViewed = asyncHandler(async(req, res) => {
  const { userId } = req;

  // const user = await User.findById(userId).lean();
  const user = await User.findById(userId)
    .populate('recentlyViewed.listing') // populate listing docs
    .lean();


  // // populate recentviewed with listing
  // user.recentlyViewed = await Promise.all(
  //   user.recentlyViewed.map(async (item) => {
  //     const listing = await Listing.findById(item.listing).lean();
  //     return { ...item, listing };
  //   }),
  // );

  if (!user) {
    throw new NotFoundError('User doesn\'t exist');
  }

  res.status(200).json({
    message: 'Recently viewed',
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

export { registerListing, getMyListings, getListing, recentlyViewed, getNearbyListings, updateListing, deleteListing, searchListings };
