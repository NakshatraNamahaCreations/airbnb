import asyncHandler from '../middlewares/asynchandler.js';
import Wishlist from '../models/wishlist.model.js';
import Favorite from '../models/favorite.model.js';
import FeaturedArea from '../models/featured.model.js';
import Listing from '../models/listing.model.js';



const createFeatured = asyncHandler(async(req, res) =>{
  const { name, location, radiusKm } = req.body;

  const featured = await FeaturedArea.create({
    name,
    location,
    radiusKm,
    // imageUrl: req.file.path
  });
  res.status(201).json({
    message: 'Featured created successfully',
    data: featured,
  });
});

const getFeatured = asyncHandler(async(req, res) =>{
  const { userId } = req;

  const areas = await FeaturedArea.find().lean();
  // console.log('areas: ', {...areas[0], parsedCoords: areas[0].location.coordinates.map(x => parseFloat(x))});
  console.log('areas[0]: ', areas[0]);

  // fetch user wishlists once
  const userWishlists = await Wishlist.find({ user: userId }).select('_id').lean();

  // fetch favorites once
  const favs = await Favorite.find({ wishlist: { $in: userWishlists } })
    .select('listing')
    .lean();

  // build a Set of favorited listing IDs
  const favSet = new Set(favs.map((f) => f.listing.toString()));

  const results = await Promise.all(areas.map(async(area) => {
    const listings = await Listing.find({
      location: {
        $geoWithin: {
          $centerSphere: [area.location.coordinates, area.radiusKm / 6378.1],
        },
      },
    })
      .limit(10)
      .sort({ createdAt: -1 })
      .select({ title: 1, location: 1, imageUrls: { $slice: 1 } });

    // const listings = await Listing.aggregate([
    //   {
    //     $geoNear: {
    //       near: {
    //         type: 'Point',
    //         coordinates: [parseFloat(area.location.coordinates[0]), parseFloat(area.location.coordinates[1])], // Search from these coordinates
    //       },
    //       distanceField: 'distance', // Field to store the calculated distance
    //       maxDistance: parseInt(area.radius)*1000, // Limit the search by radius (in meters)
    //       spherical: true, // Use spherical geometry for accurate distance calculation
    //     },
    //   },
    // ]);

    console.log('listings: ', listings);

    // map listings → add imageUrl + isFavorited
    const enrichedListings = listings.map((l) => ({
      _id: l._id,
      title: l.title,
      location: l.location,
      imageUrl: l.imageUrls?.[0] || null,
      isFavorited: favSet.has(l._id.toString()),
    }));

    return {
      name: area.name,
      enrichedListings,
    };
  }));

  res.status(200).json({
    message: 'Featured fetched successfully',
    data: results,
  });

});


const getFeaturedById = asyncHandler(async(req, res) =>{
  const featured = await FeaturedArea.findById(req.params.id);
  res.status(200).json({
    message: 'Featured fetched successfully',
    data: featured,
  });
});

export { createFeatured, getFeatured, getFeaturedById };
