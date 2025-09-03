import User from '../models/user.model.js';
import { NotFoundError } from '../utils/error.js';
import asynchandler from '../middlewares/asynchandler.js';
import { recentlyViewed } from './listing.controller.js';
import Listing from '../models/listing.model.js';
import Collection from '../models/collection.model.js';
import Favorite from '../models/favorite.model.js';



const MIN_NAME_LEN = 3;



const getMe = asynchandler(async(req, res) => {
  const { userId } = req;

  const user = await User.findById(userId).lean();

  if (!user) {
    throw new NotFoundError('user doesnt exist');
  }

  return res.json({
    data: user,
  });

});




const normalizeData = (data = {}) => {
  const out = {};

  if (data.name !== undefined) {
    const normalized = String(data.name).trim().replace(/\s+/g, ' ');
    const countNoSpaces = normalized.replace(/\s/g, '').length; // ignore spaces in length check
    if (countNoSpaces < MIN_NAME_LEN) {
      const err = new Error('name_too_short');
      err.status = 400; // optional: so your error handler can return 400
      throw err;
    }
    out.name = normalized.toLowerCase();
  }



  if (data.email !== undefined) {
    out.email = String(data.email).trim().toLowerCase();
    // (optional) basic email check
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(out.email)) {
      throw new Error('invalid_email');
    }
  }

  //   if (data.dateOfBirth !== undefined) {
  //     const d = new Date(data.dateOfBirth);
  //     if (Number.isNaN(d.getTime())) throw new Error('invalid_dateOfBirth');
  //     if (d > new Date()) throw new Error('dob_in_future');
  //     if (d < new Date() - '18y') throw new Error('user mus tbe above 18y');
  //     out.dateOfBirth = d.toISOString(); // or store as Date in schema
  //   }


  const normalizeUtcDate = (dt) =>
    new Date(Date.UTC(dt.getUTCFullYear(), dt.getUTCMonth(), dt.getUTCDate()));

  if (data.dateOfBirth !== undefined) {
    const d = new Date(data.dateOfBirth);
    if (Number.isNaN(d.getTime())) throw new Error('invalid_dateOfBirth');

    const today = normalizeUtcDate(new Date());
    const dob = normalizeUtcDate(d);
    const cutoff18 = new Date(Date.UTC(today.getUTCFullYear() - 18, today.getUTCMonth(), today.getUTCDate()));
    const cutoff100 = new Date(Date.UTC(today.getUTCFullYear() - 100, today.getUTCMonth(), today.getUTCDate()));

    if (dob > today) throw new Error('dob_in_future');
    if (dob > cutoff18) throw new Error('must_be_18_or_older');        // age < 18
    if (dob < cutoff100) throw new Error('must_be_100_or_younger');     // age > 100

    out.dateOfBirth = d.toISOString(); // or store as Date
  }

  return out;

};


const myWishlist = asynchandler(async(req, res) => {
  const { userId } = req;
  const skip = parseInt(req.query.skip) || 0;
  const limit = parseInt(req.query.limit) || 10;

  const user = await User.findById(userId)
    .select('recentlyViewed')
    .populate({
      path: 'recentlyViewed.listing',
      select: 'imageUrls',
      options: { projection: { imageUrls: { $slice: 1 } } },
    })
    .lean();

  if (!user) {
    return res.status(404).json({ message: 'User not found' });
  }

  // Sort by viewedAt descending, take latest 4
  const recentlyViewedImages = (user.recentlyViewed || [])
    .sort((a, b) => new Date(b.viewedAt) - new Date(a.viewedAt))
    .slice(0, 4)
    .map((item) => ({
      listingId: item.listing?._id,
      imageUrl: item.listing?.imageUrls?.[0] || 'https://media.istockphoto.com/id/1530149386/vector/no-image-vector-symbol-missing-available-icon-no-gallery-for-this-moment-placeholder.jpg?s=2048x2048&w=is&k=20&c=aXXNBEft6bfUaXRECo-9ieD5FXYMPidK8vTokQmGJfw=',
      viewedAt: item.viewedAt,
    }));

  const collections0 = await Listing.aggregate([
    // Sort listings by createdAt descending
    { $sort: { createdAt: -1 } },
    // Group by collection/category
    {
      $group: {
        _id: '$collection', // Change to your field name
        name: { $first: '$collection' }, // Collection name
        imageUrl: { $first: { $arrayElemAt: ['$imageUrls', 0] } }, // First image of latest listing
      },
    },
    // Optionally remove _id if you want
    {
      $project: {
        _id: 0,
        name: 1,
        imageUrl: 1,
      },
    },
  ]);

  console.time('collectionsWithImages');
  const collections = await Collection.find({ user: userId }).lean();

  // const collectionsWithImages0 = await Promise.all(collections.map(async(col) => {
  //   const latestFavorite = await Favorite.findOne({ collectionId: col._id })
  //     .sort({ createdAt: -1 })
  //     .populate({ path: 'listingId', select: 'imageUrls' })
  //     .lean();

  //   return {
  //     name: col.name,
  //     imageUrl: latestFavorite?.listingId?.imageUrls?.[0] || null,
  //   };
  // }));
  // console.timeEnd('collectionsWithImages');


  const collectionsWithImages1 = await Favorite.aggregate([
    // Join with collections to get collection name and user
    {
      $lookup: {
        from: 'collections',
        localField: 'collectionId',
        foreignField: '_id',
        as: 'collection',
      },
    },
    { $unwind: '$collection' },
    // Only collections belonging to this user
    { $match: { 'collection.user': user._id } },
    // Join with listings to get imageUrls
    {
      $lookup: {
        from: 'listings',
        localField: 'listingId',
        foreignField: '_id',
        as: 'listing',
      },
    },
    { $unwind: '$listing' },
    // Sort so latest favorite is first per collection
    { $sort: { 'createdAt': -1 } },
    // Group by collection, pick first listing image
    {
      $group: {
        _id: '$collection._id',
        name: { $first: '$collection.name' },
        imageUrl: { $first: { $arrayElemAt: ['$listing.imageUrls', 0] } },
        favoritedAt: { $first: '$createdAt' },
      },
    },
    // Only return name and imageUrl
    {
      $project: {
        _id: 0,
        name: 1,
        imageUrl: 1,
        favoritedAt: 1,
      },
    },
    { $sort: { favoritedAt: -1 } },
    { $skip: skip },
    { $limit: limit },
  ]);

  const collectionsWithImages = await Collection.aggregate([
    { $match: { user: user._id } },

    {
      $lookup: {
        from: 'favorites',
        localField: '_id',
        foreignField: 'collectionId',
        as: 'favorites',
      },
    },
    { $unwind: { path: '$favorites', preserveNullAndEmptyArrays: true } },

    {
      $lookup: {
        from: 'listings',
        localField: 'favorites.listingId',
        foreignField: '_id',
        as: 'listing',
      },
    },
    { $unwind: { path: '$listing', preserveNullAndEmptyArrays: true } },

    { $sort: { 'favorites.createdAt': -1 } },

    {
      $group: {
        _id: '$_id',
        name: { $first: '$name' },
        createdAt: { $first: '$createdAt' },
        imageUrl: { $first: { $arrayElemAt: ['$listing.imageUrls', 0] } },
        favoritedAt: { $first: '$favorites.createdAt' },
      },
    },

    {
      $addFields: {
        sortDate: { $ifNull: ['$favoritedAt', '$createdAt'] },
        isEmpty: { $cond: [{ $eq: ['$favoritedAt', null] }, true, false] },
      },
    },

    // ✅ sort *with* sortDate
    { $sort: { sortDate: -1 } },

    // ✅ only now project away sortDate if you don’t want it in response
    {
      $project: {
        _id: 0,
        name: 1,
        imageUrl: {
          $ifNull: ['$imageUrl', 'https://media.istockphoto.com/id/1147544807/vector/thumbnail-image-vector-graphic.jpg?s=2048x2048&w=is&k=20&c=dFWJz1EFJt7Tq2lA-hgTpSW119YywTWtS4EwU3fpKrE='],
        },
        favoritedAt: 1,
        createdAt: 1,
        isEmpty: 1,
      },
    },

    { $skip: skip },
    { $limit: limit },
  ]);





  console.timeEnd('collectionsWithImages');


  res.status(200).json({
    message: 'Recently viewed images fetched successfully',
    data: { recentlyViewedImages, collectionsWithImages },
  });
});




const updateMe = asynchandler(async(req, res) => {
  const { userId } = req;


  // whitelist updatable fields for self-service
  const allowed = ['name', 'email', 'dateOfBirth'];
  // const $set = {};
  // for (const k of allowed) {
  //   if (req.body[k] !== undefined) $set[k] = req.body[k];
  // }

  const pick = (obj, keys) => keys.reduce((a, k) => (obj[k] !== undefined ? (a[k] = obj[k], a) : a), {});

  const raw = pick(req.body, allowed);
  console.log('raw: ', raw);
  const $set = normalizeData(raw);
  console.log('$set: ', $set);

  if (Object.keys($set).length === 0) {
    return res.status(200).json({ message: 'no_changes' });
  }

  // phone/roles/host status should NOT be editable here
  const updated = await User.findByIdAndUpdate(
    // req.user._id,
    userId,
    { $set },
    { new: true, runValidators: true, lean: true },
  ).select('name email dateOfBirth phone roles hostProfile.status hostProfile.isHost');

  return res.json({ data: updated });
});



const updateUser = asynchandler(async(req, res) => {
  // admin-only middleware before this
  const { userId } = req.params;
  const $set = {};
  // minimal example—expand as needed
  if (req.body.roles) $set.roles = req.body.roles;
  if (req.body.capabilities) $set.capabilities = req.body.capabilities;
  if (req.body.hostProfile?.status) $set['hostProfile.status'] = req.body.hostProfile.status;

  const ops = { $set };
  if (req.body.roles || req.body.capabilities) ops.$inc = { tokenVersion: 1 };

  const user = await User.findByIdAndUpdate(userId, ops, { new: true, runValidators: true, lean: true })
    .select('name email dateOfBirth phone roles hostProfile.status hostProfile.isHost');
  if (!user) return res.sendStatus(404);
  return res.json({ ok: true, user: { id: String(user._id), ...user } });
});

export { getMe, updateMe, myWishlist, updateUser };
