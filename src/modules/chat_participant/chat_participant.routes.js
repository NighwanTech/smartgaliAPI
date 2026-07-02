import express from 'express';
import * as chatParticipantController from './chat_participant.controller.js';

const router = express.Router();

/**
 * @swagger
 * tags:
 *   name: ChatParticipants
 *   description: Chat Participant management APIs
 */

/**
 * @swagger
 * /api/v1/chat-participant:
 *   post:
 *     summary: Create a new chat participant
 *     tags: [ChatParticipants]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               chat_id:
 *                 type: integer
 *               user_id:
 *                 type: integer
 *               role:
 *                 type: string
 *                 enum: [admin, member]
 *               created_by:
 *                 type: integer
 *     responses:
 *       201:
 *         description: Chat participant created successfully
 */
router.post('/', chatParticipantController.createParticipant);

/**
 * @swagger
 * /api/v1/chat-participant:
 *   get:
 *     summary: Get all active chat participants
 *     tags: [ChatParticipants]
 *     responses:
 *       200:
 *         description: A list of chat participants
 */
router.get('/', chatParticipantController.getAllParticipants);

/**
 * @swagger
 * /api/v1/chat-participant/bulk-delete:
 *   post:
 *     summary: Bulk soft delete chat participants
 *     tags: [ChatParticipants]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - ids
 *             properties:
 *               ids:
 *                 type: array
 *                 items:
 *                   type: integer
 *               deletedRemarks:
 *                 type: string
 *               updated_by:
 *                 type: integer
 *     responses:
 *       200:
 *         description: Chat participants deleted successfully (bulk soft delete)
 */
router.post('/bulk-delete', chatParticipantController.bulkDeleteParticipants);

/**
 * @swagger
 * /api/v1/chat-participant/{id}:
 *   get:
 *     summary: Get a chat participant by ID
 *     tags: [ChatParticipants]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *     responses:
 *       200:
 *         description: Chat participant data
 *       404:
 *         description: Chat participant not found
 */
router.get('/:id', chatParticipantController.getParticipantById);

/**
 * @swagger
 * /api/v1/chat-participant/{id}:
 *   put:
 *     summary: Update a chat participant
 *     tags: [ChatParticipants]
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
 *               role:
 *                 type: string
 *                 enum: [admin, member]
 *               updated_by:
 *                 type: integer
 *     responses:
 *       200:
 *         description: Chat participant updated successfully
 *       404:
 *         description: Chat participant not found
 */
router.put('/:id', chatParticipantController.updateParticipant);

/**
 * @swagger
 * /api/v1/chat-participant/{id}:
 *   delete:
 *     summary: Soft delete a chat participant
 *     tags: [ChatParticipants]
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
 *         description: Chat participant deleted successfully (soft delete)
 *       404:
 *         description: Chat participant not found
 */
router.delete('/:id', chatParticipantController.deleteParticipant);

export default router;
