import express from 'express';
import * as notificationController from './notification.controller.js';

const router = express.Router();

/**
 * @swagger
 * tags:
 *   name: Notifications
 *   description: Notification management APIs
 */

/**
 * @swagger
 * /api/v1/notification:
 *   post:
 *     summary: Create a new notification
 *     tags: [Notifications]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - title
 *               - message
 *             properties:
 *               user_id:
 *                 type: integer
 *               title:
 *                 type: string
 *               message:
 *                 type: string
 *               type:
 *                 type: string
 *                 enum: [info, alert, reminder, message, system]
 *               data:
 *                 type: object
 *               is_read:
 *                 type: boolean
 *               created_by:
 *                 type: integer
 *     responses:
 *       201:
 *         description: Notification created successfully
 */
router.post('/', notificationController.createNotification);

/**
 * @swagger
 * /api/v1/notification:
 *   get:
 *     summary: Get all active notifications
 *     tags: [Notifications]
 *     responses:
 *       200:
 *         description: A list of notifications
 */
router.get('/', notificationController.getAllNotifications);

/**
 * @swagger
 * /api/v1/notification/bulk-delete:
 *   post:
 *     summary: Bulk soft delete notifications
 *     tags: [Notifications]
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
 *         description: Notifications deleted successfully (bulk soft delete)
 */
router.post('/bulk-delete', notificationController.bulkDeleteNotifications);

/**
 * @swagger
 * /api/v1/notification/{id}:
 *   get:
 *     summary: Get a notification by ID
 *     tags: [Notifications]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *     responses:
 *       200:
 *         description: Notification data
 *       404:
 *         description: Notification not found
 */
router.get('/:id', notificationController.getNotificationById);

/**
 * @swagger
 * /api/v1/notification/{id}:
 *   put:
 *     summary: Update a notification
 *     tags: [Notifications]
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
 *               is_read:
 *                 type: boolean
 *               updated_by:
 *                 type: integer
 *     responses:
 *       200:
 *         description: Notification updated successfully
 *       404:
 *         description: Notification not found
 */
router.put('/:id', notificationController.updateNotification);

/**
 * @swagger
 * /api/v1/notification/{id}:
 *   delete:
 *     summary: Soft delete a notification
 *     tags: [Notifications]
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
 *         description: Notification deleted successfully (soft delete)
 *       404:
 *         description: Notification not found
 */
router.delete('/:id', notificationController.deleteNotification);

export default router;
