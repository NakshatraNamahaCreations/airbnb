import asyncHandler from '../middlewares/asynchandler.js';
import { AuthError, NotFoundError, ConflictError } from '../utils/error.js';
import { apiLogger } from '../utils/logger.js';
import Listing from '../models/listing.model.js';
import Wishlist from '../models/wishlist.model.js';
import User from '../models/user.model.js';
import Favorite from '../models/favorite.model.js';
import mongoose from 'mongoose';

const createWishlist = async(req, res) => {
  const { userId } = req;
  const { name, listingId } = req.body;

  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const normalizedName = name.trim().toLowerCase();
    const existingWishlist = await Wishlist.findOne({ name: normalizedName, user: userId });

    if (existingWishlist) {
      throw new ConflictError('Wishlist already exists');
    }

    const wishlist = new Wishlist({
      name: normalizedName,
      user: userId,
    });

    await wishlist.save({ session });

    if (listingId) {
      const listing = await Listing.findById(listingId).lean();

      if (!listing) {
        throw new NotFoundError('Listing doesn\'t exist');
      }

      const favorite = new Favorite({
        user: userId,
        listing,
        wishlist: wishlist._id,
      });

      await favorite.save({ session });
    }

    await session.commitTransaction();

    res.status(201).json({
      message: 'Wishlist created successfully',
      data: wishlist,
    });
  } catch (error) {
    console.log(error);
    await session.abortTransaction();
    throw error;
  } finally {
    session.endSession();
  }
};


const getMyWishlists = asyncHandler(async(req, res) => {
  const { userId } = req;

  const wishlists = await Wishlist.find({ user: userId })
    .sort({ createdAt: -1 })
    .lean();

  // const favoriteListings = await Listing.find({ _id: { $in: wishlists.map((c) => c.listings) } }).lean();

  res.status(200).json({
    message: 'All Wishlists fetched successfully',
    data: wishlists,
  });
});

const getWishlist = asyncHandler(async(req, res) => {
  const { userId } = req;
  const { id } = req.params;

  if (!mongoose.Types.ObjectId.isValid(id)) {
    throw new NotFoundError('Invalid ID');
  }

  // const wishlist1 = await Wishlist.aggregate([
  //   { $match: { _id: new mongoose.Types.ObjectId(id) } },

  //   // join favorites
  //   {
  //     $lookup: {
  //       from: 'favorites',
  //       localField: '_id',
  //       foreignField: 'wishlistId',
  //       as: 'favorites',
  //     },
  //   },

  //   // unwind favorites to join with listings
  //   { $unwind: { path: '$favorites', preserveNullAndEmptyArrays: true } },

  //   // join listings
  //   {
  //     $lookup: {
  //       from: 'listings',
  //       localField: 'favorites.listingId',
  //       foreignField: '_id',
  //       as: 'listingDetails',
  //     },
  //   },

  //   // group back so you don’t get duplicate wishlist docs
  //   {
  //     $group: {
  //       _id: '$_id',
  //       name: { $first: '$name' },
  //       user: { $first: '$user' },
  //       createdAt: { $first: '$createdAt' },
  //       listings: { $push: { $first: '$listingDetails' } },
  //     },
  //   },


  // ]);

  // const wishlist = await Wishlist.aggregate([
  //   { $match: { _id: new mongoose.Types.ObjectId(id) } },

  //   {
  //     $lookup: {
  //       from: 'favorites',
  //       let: { collId: '$_id' },
  //       pipeline: [
  //         { $match: { $expr: { $eq: ['$wishlistId', '$$collId'] } } },

  //         // join listings for each favorite
  //         {
  //           $lookup: {
  //             from: 'listings',
  //             localField: 'listingId',
  //             foreignField: '_id',
  //             as: 'listing',
  //           },
  //         },
  //         { $unwind: '$listing' },

  //         // project only the listing
  //         { $replaceRoot: { newRoot: '$listing' } },
  //       ],
  //       as: 'listings',
  //     },
  //   },

  // ]);

  // if (!wishlist) {
  //   throw new NotFoundError('Wishlist doesn\'t exist');
  // }

  // Validate ObjectId
  if (!mongoose.Types.ObjectId.isValid(id)) {
    return res.status(400).json({ message: 'Invalid wishlist ID' });
  }
  // Fetch favorites tied to this wishlist and populate both listing + wishlist
  const favorites = await Favorite.find({ wishlist: id, user: userId })
    .populate('listing', 'title imageUrls')   // ✅ bring full listing data
    // .populate('wishlist')  // ✅ bring wishlist details
    .lean();

  // if (!favorites.length) {
  //   return res.status(404).json({ message: 'No favorites found for this wishlist' });
  // }


  res.status(200).json({
    message: 'Wishlist fetched successfully',
    count: favorites?.length || 0,
    data: favorites,
  });
});

const updateWishlist = asyncHandler(async(req, res) => {
  const { userId } = req;
  const { id } = req.params;
  const { name } = req.body;

  if (!mongoose.Types.ObjectId.isValid(id)) {
    throw new NotFoundError('Invalid ID');
  }

  const wishlist = await Wishlist.findByIdAndUpdate(id, {
    $set: { name },
  }, { new: true, runValidators: true });

  if (!wishlist) {
    throw new NotFoundError('Wishlist doesn\'t exist');
  }

  res.status(200).json({
    message: 'Wishlist updated successfully',
    data: wishlist,
  });
});

const deleteWishlist = asyncHandler(async(req, res) => {
  const { userId } = req;
  const { id } = req.params;

  if (!mongoose.Types.ObjectId.isValid(id)) {
    throw new NotFoundError('Invalid ID');
  }
  // delete wishlist
  const wishlist = await Wishlist.findByIdAndDelete(id);

  if (!wishlist) {
    throw new NotFoundError('Wishlist doesn\'t exist');
  }

  res.status(200).json({
    message: 'Wishlist deleted successfully',
    data: wishlist,
  });
});

// favorites
const toggleWishlist = asyncHandler(async(req, res) => {
  const { userId } = req;
  const { wishlistId, listingId } = req.body;

  const listing = await Listing.findById(listingId).lean();

  if (!listing) {
    throw new NotFoundError('Listing doesn\'t exist');
  }

  // const favorite =  await Favorite.updateOne(
  //   { wishlist: wishlistId, listing: listingId, user: userId },
  //   { $setOnInsert: { wishlist: wishlistId, listing: listingId, user: userId } },
  //   { upsert: true },
  // );

  // Check if favorite exists
  const favorite = await Favorite.findOne({ listing: listingId, user: userId });

  if (favorite) {
    // If it exists, remove it
    await Favorite.deleteOne({ _id: favorite._id });
    return res.status(200).json({
      message: 'Favorite removed from wishlist',
      data: favorite,
    });
  } else {

    const wishlist = await Wishlist.findById(wishlistId)
      .lean();

    if (!wishlist) {
      throw new NotFoundError('Wishlist doesn\'t exist');
    }
    // If fav doesn't exist, create it
    const newFavorite = new Favorite({
      wishlist: wishlistId,
      listing: listingId,
      user: userId,
    });
    await newFavorite.save();

    return res.status(201).json({
      message: 'Favorite added to wishlist',
      data: newFavorite,
    });
  }


  // res.status(200).json({
  //   message: `Listing added to wishlist ${wishlist.name.toUpperCase()}`,
  //   data: favorite,
  // });
});

export { createWishlist, getMyWishlists, getWishlist, toggleWishlist, updateWishlist, deleteWishlist };
