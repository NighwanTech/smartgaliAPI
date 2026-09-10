import express from 'express';
import * as chatController from './chat.controller.js';
import { authenticate } from '../../middleware/auth.middleware.js';

const router = express.Router();

/**
 * @swagger
 * tags:
 *   name: Chats
 *   description: Chat management APIs
 */

/**
 * @swagger
 * /api/v1/chat:
 *   post:
 *     summary: Create a new chat
 *     tags: [Chats]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               chat_type:
 *                 type: string
 *                 enum: [one_to_one, group, community, event, business]
 *               community_id:
 *                 type: integer
 *               event_id:
 *                 type: integer
 *               business_id:
 *                 type: integer
 *               created_by:
 *                 type: integer
 *     responses:
 *       201:
 *         description: Chat created successfully
 */
router.post('/', chatController.createChat);

/**
 * @swagger
 * /api/v1/chat:
 *   get:
 *     summary: Get all active chats
 *     tags: [Chats]
 *     responses:
 *       200:
 *         description: A list of chats
 */
router.get('/', chatController.getAllChats);
router.get('/my-chats', authenticate, chatController.getConversations);
router.get('/conversations', authenticate, chatController.getConversations);
router.post('/one-to-one', authenticate, chatController.createChat);
router.post('/group', authenticate, chatController.createChat);

/**
 * @swagger
 * /api/v1/chat/bulk-delete:
 *   post:
 *     summary: Bulk soft delete chats
 *     tags: [Chats]
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
 *         description: Chats deleted successfully (bulk soft delete)
 */
router.post('/bulk-delete', chatController.bulkDeleteChats);

/**
 * @swagger
 * /api/v1/chat/{id}:
 *   get:
 *     summary: Get a chat by ID
 *     tags: [Chats]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *     responses:
 *       200:
 *         description: Chat data
 *       404:
 *         description: Chat not found
 */
router.get('/:id', chatController.getChatById);

/**
 * @swagger
 * /api/v1/chat/{id}:
 *   put:
 *     summary: Update a chat
 *     tags: [Chats]
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
 *               chat_type:
 *                 type: string
 *                 enum: [one_to_one, group, community, event, business]
 *               updated_by:
 *                 type: integer
 *     responses:
 *       200:
 *         description: Chat updated successfully
 *       404:
 *         description: Chat not found
 */
router.put('/:id', chatController.updateChat);

/**
 * @swagger
 * /api/v1/chat/{id}:
 *   delete:
 *     summary: Soft delete a chat
 *     tags: [Chats]
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
 *         description: Chat deleted successfully (soft delete)
 *       404:
 *         description: Chat not found
 */
router.delete('/:id', chatController.deleteChat);

export default router;
