import express from 'express';
import { authenticate, authenticateAdmin, authorizeRoles, } from '../middlewares/authMiddleware.js';
import { getAllUsers, adminSignup, adminLogin, getMe, updateMe, upgradeToHost } from '../controllers/admin.controller.js';


const router = express.Router();

// Admin auth
router.post('/signup', adminSignup);
router.post('/login', adminLogin);

// Admin self
router.get('/me', authenticateAdmin, getMe);
// router.patch('/me', authenticateAdmin, updateMe);

// Admin utilities
router.get('/users', authenticate, authenticateAdmin, getAllUsers);
router.post('/upgrade-to-host/:id', authenticate, authenticateAdmin, upgradeToHost);

export default router;
