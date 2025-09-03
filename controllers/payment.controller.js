import asyncHandler from '../middlewares/asynchandler.js';
import Payment from '../models/payment.model.js';

const createPayment = asyncHandler(async(req, res) => {
  const { userId } = req;
  const { amount, currency } = req.body;
  const payment = await Payment.create({ userId, amount, currency });
  res.status(201).json({
    message: 'Payment created successfully',
    data: payment,
  });
});

const getPayments = asyncHandler(async(req, res) => {
  const { userId } = req;
  const payments = await Payment.find({ userId });
  res.status(200).json({
    message: 'Payments fetched successfully',
    data: payments,
  });
});

const getPaymentById = asyncHandler(async(req, res) => {
  const { id } = req.params;
  const payment = await Payment.findById(id);
  res.status(200).json({
    message: 'Payment fetched successfully',
    data: payment,
  });
});

const updatePayment = asyncHandler(async(req, res) => {
  const { id } = req.params;
  const { amount, currency } = req.body;
  const payment = await Payment.findByIdAndUpdate(id, { amount, currency }, { new: true });
  res.status(200).json({
    message: 'Payment updated successfully',
    data: payment,
  });
});

const deletePayment = asyncHandler(async(req, res) => {
  const { id } = req.params;
  await Payment.findByIdAndDelete(id);
  res.status(200).json({
    message: 'Payment deleted successfully',
  });
});

export { createPayment, getPayments, getPaymentById, updatePayment, deletePayment };
