import mongoose from 'mongoose';

/**
 * Webhook event log. Used for idempotency — if the same Razorpay event arrives
 * twice (retry, network hiccup), we skip the second one based on `eventId`.
 *
 * `eventId` uses Razorpay's `x-razorpay-event-id` header. Falls back to a
 * deterministic hash of (event_name + payment_id) when absent.
 */
const paymentEventSchema = new mongoose.Schema({
  eventId:    { type: String, required: true, unique: true, index: true },
  eventType:  { type: String, required: true, index: true }, // e.g. 'payment.captured'
  provider:   { type: String, default: 'razorpay' },
  payload:    { type: Object, default: {} },
  processedAt:{ type: Date },
  status:     { type: String, enum: ['received', 'processed', 'failed'], default: 'received' },
  error:      { type: String },
}, { timestamps: { createdAt: true, updatedAt: false } });

const PaymentEvent = mongoose.model('PaymentEvent', paymentEventSchema);

export default PaymentEvent;
