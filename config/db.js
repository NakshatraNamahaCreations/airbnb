import mongoose from 'mongoose';

const connectDB = async() => {
  try {
    await mongoose.connect(process.env.MONGO_URI);
    console.log('Successfully connected to mongoDB 👍');
  } catch (error) {
    console.error(`ERROR: ${error.message}`);
    process.exit(1);
  }
};

process.on('SIGINT', async() => {
  await mongoose.disconnect();
  console.log('MongoDB disconnected gracefully due to app termination');
  process.exit(0);
});

process.on('SIGTERM', async() => {
  await mongoose.disconnect();
  console.log('MongoDB disconnected gracefully due to app termination');
  process.exit(0);
});

export { connectDB };
