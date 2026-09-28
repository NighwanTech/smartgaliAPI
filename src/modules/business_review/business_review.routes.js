import express from 'express';
import { authenticate } from '../../middleware/auth.middleware.js';
import * as businessReviewController from './business_review.controller.js';

const router = express.Router();

router.post('/', authenticate, businessReviewController.createReview);
router.get('/', businessReviewController.getAllReviews);
router.get('/business/:id', businessReviewController.getReviewsByBusinessId);
router.get('/:id', businessReviewController.getReviewById);
router.put('/:id', authenticate, businessReviewController.updateReview);
router.post('/:id/reply', authenticate, businessReviewController.replyReview);
router.delete('/:id', authenticate, businessReviewController.deleteReview);

export default router;
