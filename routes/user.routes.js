import express from 'express';
import { getMe, updateMe } from '../controllers/user.controller.js';

const router = express.Router();


router.get('/me', getMe);
router.patch('/me', updateMe );
// router.put('/:id', updateUser);

export default router;
