import Inventory from '../models/inventory.model.js';
import { apiLogger } from '../utils/logger.js';
import asyncHandler from '../middlewares/asynchandler.js';


const createInventory = asyncHandler(async(req, res) => {
  const { listingId, guestId, checkInDate, checkOutDate } = req.body;
  const inventory = new Inventory({ listingId, guestId, checkInDate, checkOutDate });
  await inventory.save();

  return res.status(201).json(inventory);
});


const getAllInventories = asyncHandler(async(req, res) => {
  const inventories = await Inventory.find();

  return res.status(200).json(inventories);
});


export { createInventory, getAllInventories };
