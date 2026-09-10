import express from 'express';
import * as businessReviewController from './business_review.controller.js';
import { authenticate } from '../../middleware/auth.middleware.js';

const router = express.Router();

/**
 * @swagger
 * tags:
 *   name: BusinessReviews
 *   description: Business Reviews management APIs
 */

/**
 * @swagger
 * /api/v1/business-review:
 *   post:
 *     summary: Add a new business review
 *     tags: [BusinessReviews]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - business_id
 *               - user_id
 *               - rating
 *             properties:
 *               business_id:
 *                 type: integer
 *               user_id:
 *                 type: integer
 *               rating:
 *                 type: integer
 *                 description: Rating from 1 to 5
 *               comment:
 *                 type: string
 *               created_by:
 *                 type: integer
 *     responses:
 *       201:
 *         description: Business review added successfully
 */
router.post('/', authenticate, businessReviewController.createReview);

/**
 * @swagger
 * /api/v1/business-review:
 *   get:
 *     summary: Get all active business reviews
 *     tags: [BusinessReviews]
 *     responses:
 *       200:
 *         description: A list of business reviews
 */
router.get('/', businessReviewController.getAllReviews);

/**
 * @swagger
 * /api/v1/business-review/business/{businessId}:
 *   get:
 *     summary: Get business reviews by Business ID
 *     tags: [BusinessReviews]
 *     parameters:
 *       - in: path
 *         name: businessId
 *         required: true
 *         schema:
 *           type: integer
 *     responses:
 *       200:
 *         description: A list of business reviews
 */
router.get('/business/:businessId', businessReviewController.getReviewsByBusinessId);

/**
 * @swagger
 * /api/v1/business-review/{id}:
 *   get:
 *     summary: Get a business review by ID
 *     tags: [BusinessReviews]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *     responses:
 *       200:
 *         description: Business review data
 *       404:
 *         description: Business review not found
 */
router.get('/:id', businessReviewController.getReviewById);

/**
 * @swagger
 * /api/v1/business-review/{id}:
 *   put:
 *     summary: Update a business review
 *     tags: [BusinessReviews]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               rating:
 *                 type: integer
 *               comment:
 *                 type: string
 *               updated_by:
 *                 type: integer
 *     responses:
 *       200:
 *         description: Business review updated successfully
 *       404:
 *         description: Business review not found
 */
router.put('/:id', businessReviewController.updateReview);

/**
 * @swagger
 * /api/v1/business-review/{id}:
 *   delete:
 *     summary: Soft delete a business review
 *     tags: [BusinessReviews]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               deletedRemarks:
 *                 type: string
 *               updated_by:
 *                 type: integer
 *     responses:
 *       200:
 *         description: Business review deleted successfully (soft delete)
 *       404:
 *         description: Business review not found
 */
router.delete('/:id', businessReviewController.deleteReview);

/**
 * @swagger
 * /api/v1/business-review/{id}/reply:
 *   post:
 *     summary: Reply to a business review (owner only)
 *     tags: [BusinessReviews]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - reply
 *             properties:
 *               reply:
 *                 type: string
 *     responses:
 *       200:
 *         description: Response posted successfully
 *       403:
 *         description: Not authorized to reply
 *       404:
 *         description: Review not found
 */
router.post('/:id/reply', authenticate, businessReviewController.replyToReview);

export default router;
