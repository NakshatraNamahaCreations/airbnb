import express from 'express';
import { authenticate, authorizeRoles } from '../middlewares/authMiddleware.js';
import { createSuggested, createSuggestedBulk, getSuggested, getSuggestedById, updateSuggested, deleteSuggested } from '../controllers/suggestion.controller.js';

const router = express.Router();

router.use(authenticate);
// router.use(authorizeRoles('admin'));

router.post('/bulk', createSuggestedBulk);
router.post('/', createSuggested);
router.get('/', getSuggested);
router.get('/:id', getSuggestedById);
router.put('/:id', updateSuggested);
router.delete('/:id', deleteSuggested);


export default router;
