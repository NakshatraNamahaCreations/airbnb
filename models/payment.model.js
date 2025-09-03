import mongoose from 'mongoose';

const paymentSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  amount: { type: Number, required: true },
});


const Payment = mongoose.model('Payment', paymentSchema);

export default Payment;
