import mongoose from 'mongoose';

const inventorySchema = new mongoose.Schema({
  listingId: { type: mongoose.Schema.Types.ObjectId, ref: 'Listing', required: true },
  guestId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },

  checkInDate: { type: Date, required: true },
  checkOutDate: { type: Date, required: true },

  reserved: { type: Number, default: 0, min: [0, 'reserved cannot be negative'] },

}, { timestamps: true });

const Inventory = mongoose.model('Inventory', inventorySchema);

export default Inventory;
