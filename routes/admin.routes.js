import express from 'express';
import { authenticateAdmin, authorizeAdminRoles } from '../middlewares/authMiddleware.js';
import {
  adminLogin, adminLogout, getMe, updateMe,
  listAdmins, createAdmin, updateAdmin, deleteAdmin,
  getAllUsers, getUserById, updateUser, suspendUser, activateUser, deleteUser,
  upgradeToHost, downgradeFromHost, getUserBookings, createHost, updateHost,
  listListings, getListingAdmin, approveListing, rejectListing, pauseListing, activateListing,
  listBookings, getBookingAdmin, cancelBookingByAdmin,
  listPayments, getPaymentAdmin, refundPayment,
  listFeedbacks, deleteFeedbackById,
  listKyc, getKycForUser, overrideKyc,
  listAuditLogs, dashboardOverview,
} from '../controllers/admin.controller.js';

const router = express.Router();

/* public admin endpoints */
router.post('/login', adminLogin);

/* everything below requires a valid admin token */
router.use(authenticateAdmin);

router.post('/logout', adminLogout);
router.get('/me', getMe);
router.patch('/me', updateMe);

/* dashboard */
router.get('/dashboard/overview', dashboardOverview);

/* admin management (super_admin only) */
router.get('/admins', authorizeAdminRoles('super_admin'), listAdmins);
router.post('/admins', authorizeAdminRoles('super_admin'), createAdmin);
router.patch('/admins/:id', authorizeAdminRoles('super_admin'), updateAdmin);
router.delete('/admins/:id', authorizeAdminRoles('super_admin'), deleteAdmin);

/* hosts (admin-created users with host role) */
router.post('/hosts', authorizeAdminRoles('super_admin', 'admin'), createHost);
router.patch('/hosts/:id', authorizeAdminRoles('super_admin', 'admin'), updateHost);

/* users */
router.get('/users', getAllUsers);
router.get('/users/:id', getUserById);
router.patch('/users/:id', authorizeAdminRoles('super_admin', 'admin'), updateUser);
router.post('/users/:id/suspend', authorizeAdminRoles('super_admin', 'admin'), suspendUser);
router.post('/users/:id/activate', authorizeAdminRoles('super_admin', 'admin'), activateUser);
router.delete('/users/:id', authorizeAdminRoles('super_admin', 'admin'), deleteUser);
router.post('/users/:id/upgrade-to-host', authorizeAdminRoles('super_admin', 'admin'), upgradeToHost);
router.post('/users/:id/downgrade-from-host', authorizeAdminRoles('super_admin', 'admin'), downgradeFromHost);
router.get('/users/:id/bookings', getUserBookings);

/* listings */
router.get('/listings', listListings);
router.get('/listings/:id', getListingAdmin);
router.post('/listings/:id/approve', authorizeAdminRoles('super_admin', 'admin'), approveListing);
router.post('/listings/:id/reject', authorizeAdminRoles('super_admin', 'admin'), rejectListing);
router.post('/listings/:id/pause', authorizeAdminRoles('super_admin', 'admin'), pauseListing);
router.post('/listings/:id/activate', authorizeAdminRoles('super_admin', 'admin'), activateListing);

/* bookings */
router.get('/bookings', listBookings);
router.get('/bookings/:id', getBookingAdmin);
router.post('/bookings/:id/cancel', authorizeAdminRoles('super_admin', 'admin'), cancelBookingByAdmin);

/* payments */
router.get('/payments', listPayments);
router.get('/payments/:id', getPaymentAdmin);
router.post('/payments/:id/refund', authorizeAdminRoles('super_admin', 'admin'), refundPayment);

/* feedbacks */
router.get('/feedbacks', listFeedbacks);
router.delete('/feedbacks/:id', authorizeAdminRoles('super_admin', 'admin'), deleteFeedbackById);

/* kyc */
router.get('/kyc', listKyc);
router.get('/kyc/:id', getKycForUser);
router.post('/kyc/:id/override', authorizeAdminRoles('super_admin', 'admin'), overrideKyc);

/* audit log */
router.get('/audit-logs', authorizeAdminRoles('super_admin', 'admin'), listAuditLogs);

export default router;
