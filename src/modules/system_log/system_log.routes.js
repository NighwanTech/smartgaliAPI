import express from 'express';
import * as logController from './system_log.controller.js';

const router = express.Router();

/**
 * @swagger
 * tags:
 *   name: SystemLog
 *   description: System Logs endpoints
 */

/**
 * @swagger
 * /api/v1/log:
 *   post:
 *     summary: Create new log entry
 *     tags: [SystemLog]
 *     responses:
 *       201:
 *         description: Log created successfully
 */
router.post('/', logController.createLog);

/**
 * @swagger
 * /api/v1/log/activity:
 *   get:
 *     summary: Get all activity logs
 *     tags: [SystemLog]
 *     responses:
 *       200:
 *         description: Success
 */
router.get('/activity', logController.getActivityLogs);

/**
 * @swagger
 * /api/v1/log/error:
 *   get:
 *     summary: Get all error logs
 *     tags: [SystemLog]
 *     responses:
 *       200:
 *         description: Success
 */
router.get('/error', logController.getErrorLogs);

/**
 * @swagger
 * /api/v1/log/{id}:
 *   get:
 *     summary: Get log by ID
 *     tags: [SystemLog]
 *     responses:
 *       200:
 *         description: Success
 */
router.get('/:id', logController.getLogById);

export default router;
