import mongoose from 'mongoose';

const inventorySchema = new mongoose.Schema({
  listingId: { type: mongoose.Schema.Types.ObjectId, ref: 'Listing', required: true },

  // Date range for this inventory record
  checkInDate: { type: Date, required: true },
  checkOutDate: { type: Date, required: true },

  // Status of this inventory period
  status: {
    type: String,
    enum: ['available', 'fully_booked', 'maintenance', 'blocked'],
    default: 'available',
  },

  // Optional notes (maintenance, special events, etc.)
  notes: { type: String },

  // Reference to the enquiry that created this reservation (if applicable)
  enquiryId: { type: mongoose.Schema.Types.ObjectId, ref: 'Enquiry' },

  // Guest information (if this is a specific reservation)
  guestId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },

}, { timestamps: true });

// Index for efficient queries
inventorySchema.index({ listingId: 1, checkInDate: 1, checkOutDate: 1 });
inventorySchema.index({ listingId: 1, status: 1 });

// Method to check if dates overlap
inventorySchema.methods.datesOverlap = function(checkIn, checkOut) {
  return this.checkInDate < checkOut && this.checkOutDate > checkIn;
};

const Inventory = mongoose.model('Inventory', inventorySchema);

export default Inventory;
