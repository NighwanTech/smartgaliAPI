import express from 'express';
import * as communityController from './community.controller.js';
import { upload } from '../../middleware/upload.middleware.js';

const router = express.Router();

/**
 * @swagger
 * tags:
 *   name: Communities
 *   description: Community management APIs
 */

/**
 * @swagger
 * /api/v1/community:
 *   post:
 *     summary: Create a new community
 *     tags: [Communities]
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             required:
 *               - communityName
 *             properties:
 *               communityName:
 *                 type: string
 *               communityDescription:
 *                 type: string
 *               category_id:
 *                 type: integer
 *               created_by:
 *                 type: integer
 *               cover_image:
 *                 type: string
 *                 format: binary
 *               is_private:
 *                 type: boolean
 *               status:
 *                 type: string
 *                 enum: [active, inactive, pending]
 *     responses:
 *       201:
 *         description: Community created successfully
 */
router.post('/', upload.single('cover_image'), communityController.createCommunity);

/**
 * @swagger
 * /api/v1/community:
 *   get:
 *     summary: Get all active communities
 *     tags: [Communities]
 *     responses:
 *       200:
 *         description: A list of communities
 */
router.get('/', communityController.getAllCommunities);

/**
 * @swagger
 * /api/v1/community/{id}:
 *   get:
 *     summary: Get a community by ID
 *     tags: [Communities]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *     responses:
 *       200:
 *         description: Community data
 *       404:
 *         description: Community not found
 */
router.get('/:id', communityController.getCommunityById);

/**
 * @swagger
 * /api/v1/community/{id}:
 *   put:
 *     summary: Update a community
 *     tags: [Communities]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             properties:
 *               communityName:
 *                 type: string
 *               communityDescription:
 *                 type: string
 *               category_id:
 *                 type: integer
 *               created_by:
 *                 type: integer
 *               cover_image:
 *                 type: string
 *                 format: binary
 *               is_private:
 *                 type: boolean
 *               status:
 *                 type: string
 *                 enum: [active, inactive, pending]
 *     responses:
 *       200:
 *         description: Community updated successfully
 *       404:
 *         description: Community not found
 */
router.put('/:id', upload.single('cover_image'), communityController.updateCommunity);

/**
 * @swagger
 * /api/v1/community/{id}:
 *   delete:
 *     summary: Soft delete a community
 *     tags: [Communities]
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
 *                 type: string
 *     responses:
 *       200:
 *         description: Community deleted successfully (soft delete)
 *       404:
 *         description: Community not found
 */
router.delete('/:id', communityController.deleteCommunity);

export default router;
