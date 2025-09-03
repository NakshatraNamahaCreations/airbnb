import asyncHandler from '../middlewares/asynchandler.js';
import { AuthError, NotFoundError, ConflictError } from '../utils/error.js';
import { apiLogger } from '../utils/logger.js';
import Listing from '../models/listing.model.js';
import Collection from '../models/collection.model.js';
import User from '../models/user.model.js';
import Favorite from '../models/favorite.model.js';
import mongoose from 'mongoose';

const createCollection = asyncHandler(async(req, res) => {
  const { userId } = req;
  const { name } = req.body;

  const existingCollection = await Collection.findOne({ name, user: userId });

  if (existingCollection) {
    throw new ConflictError('Collection already exists');
  }

  const collection = new Collection({
    name,
    user: userId,
  });

  await collection.save();

  res.status(201).json({
    message: 'Collection created successfully',
    data: collection,
  });
});

const getMyCollections = asyncHandler(async(req, res) => {
  const { userId } = req;

  const collections = await Collection.find({ user: userId })
    .sort({ createdAt: -1 })
    .lean();

  // const favoriteListings = await Listing.find({ _id: { $in: collections.map((c) => c.listings) } }).lean();

  res.status(200).json({
    message: 'All Collections fetched successfully',
    data: collections,
  });
});

const getCollection = asyncHandler(async(req, res) => {
  const { userId } = req;
  const { id } = req.params;

  if (!mongoose.Types.ObjectId.isValid(id)) {
    throw new NotFoundError('Invalid ID');
  }

  const collection1 = await Collection.aggregate([
    { $match: { _id: new mongoose.Types.ObjectId(id) } },

    // join favorites
    {
      $lookup: {
        from: 'favorites',
        localField: '_id',
        foreignField: 'collectionId',
        as: 'favorites',
      },
    },

    // unwind favorites to join with listings
    { $unwind: { path: '$favorites', preserveNullAndEmptyArrays: true } },

    // join listings
    {
      $lookup: {
        from: 'listings',
        localField: 'favorites.listingId',
        foreignField: '_id',
        as: 'listingDetails',
      },
    },

    // group back so you don’t get duplicate collection docs
    {
      $group: {
        _id: '$_id',
        name: { $first: '$name' },
        user: { $first: '$user' },
        createdAt: { $first: '$createdAt' },
        listings: { $push: { $first: '$listingDetails' } },
      },
    },


  ]);

  const collection = await Collection.aggregate([
    { $match: { _id: new mongoose.Types.ObjectId(id) } },

    {
      $lookup: {
        from: 'favorites',
        let: { collId: '$_id' },
        pipeline: [
          { $match: { $expr: { $eq: ['$collectionId', '$$collId'] } } },

          // join listings for each favorite
          {
            $lookup: {
              from: 'listings',
              localField: 'listingId',
              foreignField: '_id',
              as: 'listing',
            },
          },
          { $unwind: '$listing' },

          // project only the listing
          { $replaceRoot: { newRoot: '$listing' } },
        ],
        as: 'listings',
      },
    },

  ]);

  if (!collection) {
    throw new NotFoundError('Collection doesn\'t exist');
  }


  res.status(200).json({
    message: 'Collection fetched successfully',
    data: collection,
  });
});

const updateCollection = asyncHandler(async(req, res) => {
  const { userId } = req;
  const { id } = req.params;
  const { name } = req.body;

  if (!mongoose.Types.ObjectId.isValid(id)) {
    throw new NotFoundError('Invalid ID');
  }

  const collection = await Collection.findByIdAndUpdate(id, {
    $set: { name },
  }, { new: true, runValidators: true });

  if (!collection) {
    throw new NotFoundError('Collection doesn\'t exist');
  }

  res.status(200).json({
    message: 'Collection updated successfully',
    data: collection,
  });
});

const deleteCollection = asyncHandler(async(req, res) => {
  const { userId } = req;
  const { id } = req.params;

  if (!mongoose.Types.ObjectId.isValid(id)) {
    throw new NotFoundError('Invalid ID');
  }
  // delete collection
  const collection = await Collection.findByIdAndDelete(id);

  if (!collection) {
    throw new NotFoundError('Collection doesn\'t exist');
  }

  res.status(200).json({
    message: 'Collection deleted successfully',
    data: collection,
  });
});

// favorites
const addToCollection = asyncHandler(async(req, res) => {
  const { userId } = req;
  const { collectionId, listingId } = req.params;

  const collection = await Collection.findById(collectionId)
    .lean();

  if (!collection) {
    throw new NotFoundError('Collection doesn\'t exist');
  }

  const listing = await Listing.findById(listingId).lean();

  if (!listing) {
    throw new NotFoundError('Listing doesn\'t exist');
  }

  const favorite =  await Favorite.updateOne(
    { collectionId, listingId },
    { $setOnInsert: { collectionId, listingId } },
    { upsert: true },
  );

  res.status(200).json({
    message: `Listing added to collection ${collection.name.toUpperCase()}`,
    data: favorite,
  });
});

const removeFromCollection = asyncHandler(async(req, res) => {
  const { userId } = req;
  const { collectionId, listingId } = req.params;

  const collection = await Collection.findById(collectionId)
    .lean();

  if (!collection) {
    throw new NotFoundError('Collection doesn\'t exist');
  }

  const listing = await Listing.findById(listingId).lean();

  if (!listing) {
    throw new NotFoundError('Listing doesn\'t exist');
  }

  const favorite = await Favorite.findOneAndDelete({ collectionId, listingId });

  if (!favorite) {
    throw new NotFoundError('Favorite doesn\'t exist');
  }

  res.status(200).json({
    message: `Listing removed from collection ${collection.name.toUpperCase()}`,
    data: favorite,
  });
});

export { createCollection, getMyCollections, getCollection, addToCollection, removeFromCollection, updateCollection, deleteCollection };
