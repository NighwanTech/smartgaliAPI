import express from 'express';
import * as settingController from './setting.controller.js';

const router = express.Router();

/**
 * @swagger
 * tags:
 *   name: Setting
 *   description: Global Configuration and Settings endpoints
 */

/**
 * @swagger
 * /api/v1/setting/public:
 *   get:
 *     summary: Get all public settings
 *     tags: [Setting]
 *     responses:
 *       200:
 *         description: Success
 */
router.get('/public', settingController.getPublicSettings);

/**
 * @swagger
 * /api/v1/setting/{group}:
 *   get:
 *     summary: Get settings by group (general, payment, api)
 *     tags: [Setting]
 *     parameters:
 *       - in: path
 *         name: group
 *         required: true
 *         schema:
 *           type: string
 *           enum: [general, payment, api]
 *     responses:
 *       200:
 *         description: Success
 */
router.get('/:group', settingController.getSettingsByGroup);

/**
 * @swagger
 * /api/v1/setting/{group}/bulk:
 *   put:
 *     summary: Bulk update settings for a group
 *     tags: [Setting]
 *     parameters:
 *       - in: path
 *         name: group
 *         required: true
 *         schema:
 *           type: string
 *           enum: [general, payment, api]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             additionalProperties:
 *               type: string
 *     responses:
 *       200:
 *         description: Success
 */
router.put('/:group/bulk', settingController.bulkUpdateSettings);

export default router;
