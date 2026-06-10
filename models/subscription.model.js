import mongoose from 'mongoose';

const SUBSCRIPTION_STATUS = ['pending_payment', 'active', 'expired', 'cancelled', 'failed'];

const subscriptionSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  plan:   { type: String, required: true }, // matches a key in SUBSCRIPTION_PLANS

  status: { type: String, enum: SUBSCRIPTION_STATUS, default: 'pending_payment', index: true },

  amountPaise: { type: Number, required: true, min: 0 },
  currency:    { type: String, default: 'INR' },

  // origin of the subscription
  source: { type: String, enum: ['razorpay', 'admin_grant'], default: 'razorpay', index: true },

  // razorpay (only set when source === 'razorpay')
  razorpayOrderId:   { type: String, index: true },
  razorpayPaymentId: { type: String, sparse: true, unique: true }, // idempotency
  razorpaySignature: { type: String },

  // admin-grant metadata (only set when source === 'admin_grant')
  grantedByAdminId: { type: mongoose.Schema.Types.ObjectId, ref: 'Admin' },
  grantReason:      { type: String },

  // entitlement
  activeFrom:  { type: Date },
  activeUntil: { type: Date, index: true },

  // expiry of the pending intent (if never verified)
  expiresAt:   { type: Date, index: true },

  // last payment that activated/renewed
  lastPaymentAt: { type: Date },
}, { timestamps: true });

subscriptionSchema.index({ userId: 1, status: 1 });

const Subscription = mongoose.model('Subscription', subscriptionSchema);

export { SUBSCRIPTION_STATUS };
export default Subscription;
