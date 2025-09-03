import Payment from '../models/payment.model.js';



const createPayment = async(userId, amount, session) => {
  const payment = await Payment.create(
    [{ userId, amount }],
    { session },
  );


  return payment;
};

const getPayments = async(userId) => {
  const payments = await Payment.find({ userId });

  return payments;
};

export default {
  createPayment,
  getPayments,
};
