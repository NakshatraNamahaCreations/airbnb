import mongoose from 'mongoose';

const BOOKING_STATUS = [
  'pending',
  'accepted',
  'rejected',
  'cancelled_by_guest',
  'cancelled_by_admin',
  'completed',
  'no_show',
];

const bookingSchema = new mongoose.Schema({
  listingId: { type: mongoose.Schema.Types.ObjectId, ref: 'Listing', required: true },
  guestId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },

  checkInDate: { type: Date, required: true },
  checkOutDate: { type: Date, required: true },
  guests: { adults: Number, children: Number, infants: Number, pets: Number },

  message: { type: String },

  status: { type: String, enum: BOOKING_STATUS, default: 'pending', index: true },
  rejectionReason: { type: String },
  cancellationReason: { type: String },
  cancelledAt: { type: Date },
  cancelledByAdminId: { type: mongoose.Schema.Types.ObjectId, ref: 'Admin' },
  completedAt: { type: Date },
}, { timestamps: true });

const Booking = mongoose.model('Booking', bookingSchema);

export { BOOKING_STATUS };
export default Booking;
