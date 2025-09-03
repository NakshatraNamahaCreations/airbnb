import express from 'express';
import { createCollection, getMyCollections, getCollection, addToCollection, removeFromCollection, updateCollection, deleteCollection } from '../controllers/collection.controller.js';
import { authenticate } from '../middlewares/authMiddleware.js';

const router = express.Router();

router.use(authenticate);

router.post('/', createCollection);
router.get('/', getMyCollections);
router.get('/:id', getCollection);
router.patch('/:id', updateCollection);
router.delete('/:id', deleteCollection);

// favorites
router.post('/:collectionId/listings/:listingId', addToCollection);
router.delete('/:collectionId/listings/:listingId', removeFromCollection);
// router.get('/:collectionId/listings', getCollectionListings);

export default router;
