import mongoose from 'mongoose';

const PAYMENT_STATUS = ['created', 'captured', 'failed', 'refunded', 'partially_refunded'];

const paymentSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  bookingId: { type: mongoose.Schema.Types.ObjectId, ref: 'Booking', index: true },
  amount: { type: Number, required: true },
  currency: { type: String, default: 'INR' },
  status: { type: String, enum: PAYMENT_STATUS, default: 'created', index: true },
  provider: { type: String, default: 'razorpay' },
  razorpayOrderId: { type: String },
  razorpayPaymentId: { type: String },
  razorpaySignature: { type: String },
  refundedAmount: { type: Number, default: 0 },
  refunds: [{
    refundId: String,
    amount: Number,
    reason: String,
    status: String,
    createdAt: { type: Date, default: Date.now },
    processedByAdminId: { type: mongoose.Schema.Types.ObjectId, ref: 'Admin' },
  }],
  failureReason: { type: String },
  capturedAt: { type: Date },
  meta: { type: Object, default: {} },
}, { timestamps: true });

const Payment = mongoose.model('Payment', paymentSchema);

export { PAYMENT_STATUS };
export default Payment;
