import express from 'express';
import { getAllUsers, upgradeToHost } from '../controllers/admin.controller.js';


const router = express.Router();

router.get('/users', getAllUsers);
router.get('/upgrade-to-host/:id', upgradeToHost );

export default router;
