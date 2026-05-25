import express from 'express';
import { authenticate, authenticateAdmin } from '../middlewares/authMiddleware.js';
import {
  createSuggested,
  createSuggestedBulk,
  getSuggested,
  getSuggestedById,
  updateSuggested,
  deleteSuggested,
} from '../controllers/suggestion.controller.js';

const router = express.Router();

// Reads are open to authenticated users (homepage uses them).
router.get('/', authenticate, getSuggested);
router.get('/:id', authenticate, getSuggestedById);

// Writes are admin-only.
router.post('/bulk', authenticateAdmin, createSuggestedBulk);
router.post('/', authenticateAdmin, createSuggested);
router.put('/:id', authenticateAdmin, updateSuggested);
router.delete('/:id', authenticateAdmin, deleteSuggested);

export default router;
