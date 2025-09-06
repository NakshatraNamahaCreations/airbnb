import authRoutes from './auth.routes.js';
import userRoutes from './user.routes.js';
import adminRoutes from './admin.routes.js';
import listingRoutes from './listing.routes.js';
import uploadRoutes from './upload.routes.js';
import collectionRoutes from './collection.routes.js';
import bookingsRoutes from './booking.routes.js';
import featuredRoutes from './featured.routes.js';
import feedbackRoutes from './feedback.routes.js';
import paymentRoutes from './payment.routes.js';
import tempRoutes from './temp.routes.js';

const registerRoutes = (app) => {
  app.use('/api/v1/auth', authRoutes);
  app.use('/api/v1/admin', adminRoutes);
  app.use('/api/v1/users', userRoutes);
  app.use('/api/v1/listings', listingRoutes);
  app.use('/api/v1/collections', collectionRoutes);
  app.use('/api/v1/bookings', bookingsRoutes);
  app.use('/api/v1/uploads', uploadRoutes);
  app.use('/api/v1/featured-areas', featuredRoutes);
  app.use('/api/v1/feedback', feedbackRoutes);
  app.use('/api/v1/payments', paymentRoutes);
  app.use('/api/v1/temp', tempRoutes);
};

export default registerRoutes;
  