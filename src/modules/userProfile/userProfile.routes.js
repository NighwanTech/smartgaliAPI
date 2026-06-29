import express from 'express';
import * as userProfileController from './userProfile.controller.js';

const router = express.Router();

/**
 * @swagger
 * tags:
 *   name: UserProfiles
 *   description: User Profile management APIs
 */

/**
 * @swagger
 * /api/v1/user-profile:
 *   post:
 *     summary: Create a new user profile
 *     tags: [UserProfiles]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - user_id
 *             properties:
 *               user_id:
 *                 type: integer
 *               dob:
 *                 type: string
 *                 format: date
 *               gender:
 *                 type: string
 *                 enum: [male, female, other]
 *               bio:
 *                 type: string
 *               occupation:
 *                 type: string
 *               website:
 *                 type: string
 *     responses:
 *       201:
 *         description: User profile created successfully
 */
router.post('/', userProfileController.createUserProfile);

/**
 * @swagger
 * /api/v1/user-profile:
 *   get:
 *     summary: Get all active user profiles
 *     tags: [UserProfiles]
 *     responses:
 *       200:
 *         description: A list of user profiles
 */
router.get('/', userProfileController.getAllUserProfiles);

/**
 * @swagger
 * /api/v1/user-profile/{id}:
 *   get:
 *     summary: Get a user profile by ID
 *     tags: [UserProfiles]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *     responses:
 *       200:
 *         description: User profile data
 *       404:
 *         description: User profile not found
 */
router.get('/:id', userProfileController.getUserProfileById);

/**
 * @swagger
 * /api/v1/user-profile/{id}:
 *   put:
 *     summary: Update a user profile
 *     tags: [UserProfiles]
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
 *               user_id:
 *                 type: integer
 *               dob:
 *                 type: string
 *                 format: date
 *               gender:
 *                 type: string
 *                 enum: [male, female, other]
 *               bio:
 *                 type: string
 *               occupation:
 *                 type: string
 *               website:
 *                 type: string
 *     responses:
 *       200:
 *         description: User profile updated successfully
 *       404:
 *         description: User profile not found
 */
router.put('/:id', userProfileController.updateUserProfile);

/**
 * @swagger
 * /api/v1/user-profile/{id}:
 *   delete:
 *     summary: Soft delete a user profile
 *     tags: [UserProfiles]
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
 *         description: User profile deleted successfully (soft delete)
 *       404:
 *         description: User profile not found
 */
router.delete('/:id', userProfileController.deleteUserProfile);

export default router;
