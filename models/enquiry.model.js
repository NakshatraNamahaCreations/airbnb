import mongoose from 'mongoose';

const enquirySchema = new mongoose.Schema({
  listingId: { type: mongoose.Schema.Types.ObjectId, ref: 'Listing', required: true },
  guestId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },

  checkInDate: { type: Date, required: true },
  checkOutDate: { type: Date, required: true },
  guests: { adults: Number, children: Number, infants: Number, pets: Number },

  message: { type: String }, // optional note from guest

  status: { type: String, enum: ['pending', 'accepted', 'rejected'], default: 'pending' },
  rejectionReason: { type: String }, // reason for rejection when status is rejected
}, { timestamps: true });

const Enquiry = mongoose.model('Enquiry', enquirySchema);

export default Enquiry;
