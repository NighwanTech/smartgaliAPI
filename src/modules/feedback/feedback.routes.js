import express from 'express';
import * as feedbackController from './feedback.controller.js';

const router = express.Router();

/**
 * @swagger
 * tags:
 *   name: Feedback
 *   description: User Feedback endpoints
 */

/**
 * @swagger
 * /api/v1/feedback:
 *   post:
 *     summary: Submit new feedback
 *     tags: [Feedback]
 *     responses:
 *       201:
 *         description: Feedback submitted successfully
 */
router.post('/', feedbackController.createFeedback);

/**
 * @swagger
 * /api/v1/feedback:
 *   get:
 *     summary: Get all feedbacks
 *     tags: [Feedback]
 *     responses:
 *       200:
 *         description: Success
 */
router.get('/', feedbackController.getAllFeedback);

/**
 * @swagger
 * /api/v1/feedback/{id}:
 *   get:
 *     summary: Get feedback by ID
 *     tags: [Feedback]
 *     responses:
 *       200:
 *         description: Success
 */
router.get('/:id', feedbackController.getFeedbackById);

/**
 * @swagger
 * /api/v1/feedback/{id}:
 *   put:
 *     summary: Update feedback status
 *     tags: [Feedback]
 *     responses:
 *       200:
 *         description: Success
 */
router.put('/:id', feedbackController.updateFeedback);

/**
 * @swagger
 * /api/v1/feedback/{id}:
 *   delete:
 *     summary: Delete feedback
 *     tags: [Feedback]
 *     responses:
 *       200:
 *         description: Success
 */
router.delete('/:id', feedbackController.deleteFeedback);

export default router;
