import express from 'express';
import * as messageController from './message.controller.js';

const router = express.Router();

/**
 * @swagger
 * tags:
 *   name: Messages
 *   description: Message management APIs
 */

/**
 * @swagger
 * /api/v1/message:
 *   post:
 *     summary: Create a new message
 *     tags: [Messages]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               chat_id:
 *                 type: integer
 *               sender_id:
 *                 type: integer
 *               message:
 *                 type: string
 *               media_url:
 *                 type: string
 *               reply_to:
 *                 type: integer
 *               created_by:
 *                 type: integer
 *     responses:
 *       201:
 *         description: Message created successfully
 */
router.post('/', messageController.createMessage);
router.post('/send', messageController.sendMessage);
router.post('/mark-all-read', messageController.markAllRead);
router.get('/chat/:chatId', messageController.getChatMessages);
router.get('/chat/:chatId/messages', messageController.getChatMessages);

/**
 * @swagger
 * /api/v1/message:
 *   get:
 *     summary: Get all active messages
 *     tags: [Messages]
 *     responses:
 *       200:
 *         description: A list of messages
 */
router.get('/', messageController.getAllMessages);

/**
 * @swagger
 * /api/v1/message/bulk-delete:
 *   post:
 *     summary: Bulk soft delete messages
 *     tags: [Messages]
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
 *         description: Messages deleted successfully (bulk soft delete)
 */
router.post('/bulk-delete', messageController.bulkDeleteMessages);

/**
 * @swagger
 * /api/v1/message/{id}:
 *   get:
 *     summary: Get a message by ID
 *     tags: [Messages]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *     responses:
 *       200:
 *         description: Message data
 *       404:
 *         description: Message not found
 */
router.get('/:id', messageController.getMessageById);

/**
 * @swagger
 * /api/v1/message/{id}:
 *   put:
 *     summary: Update a message
 *     tags: [Messages]
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
 *               message:
 *                 type: string
 *               is_read:
 *                 type: boolean
 *               updated_by:
 *                 type: integer
 *     responses:
 *       200:
 *         description: Message updated successfully
 *       404:
 *         description: Message not found
 */
router.put('/:id', messageController.updateMessage);

/**
 * @swagger
 * /api/v1/message/{id}:
 *   delete:
 *     summary: Soft delete a message
 *     tags: [Messages]
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
 *         description: Message deleted successfully (soft delete)
 *       404:
 *         description: Message not found
 */
router.delete('/:id', messageController.deleteMessage);

export default router;
