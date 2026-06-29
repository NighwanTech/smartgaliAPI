import express from 'express';
import * as userController from './user.controller.js';
import { uploadImage } from '../../utils/fileUpload.js';

const router = express.Router();

/**
 * @swagger
 * tags:
 *   name: Users
 *   description: User management APIs
 */

/**
 * @swagger
 * /api/v1/user:
 *   post:
 *     summary: Create a new user
 *     tags: [Users]
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             required:
 *               - userName
 *               - email
 *               - password
 *             properties:
 *               role_id:
 *                 type: integer
 *               userName:
 *                 type: string
 *               email:
 *                 type: string
 *               phone:
 *                 type: string
 *               password:
 *                 type: string
 *                 format: password
 *               profile_image:
 *                 type: string
 *                 format: binary
 *               address:
 *                 type: string
 *               latitude:
 *                 type: number
 *               longitude:
 *                 type: number
 *               is_verified:
 *                 type: boolean
 *               status:
 *                 type: string
 *                 enum: [active, inactive, pending]
 *     responses:
 *       201:
 *         description: User created successfully
 */
router.post('/', uploadImage('user').single('profile_image'), userController.createUser);

/**
 * @swagger
 * /api/v1/user:
 *   get:
 *     summary: Get all active users
 *     tags: [Users]
 *     responses:
 *       200:
 *         description: A list of users
 */
router.get('/', userController.getAllUsers);

/**
 * @swagger
 * /api/v1/user/{id}:
 *   get:
 *     summary: Get a user by ID
 *     tags: [Users]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *     responses:
 *       200:
 *         description: User data
 *       404:
 *         description: User not found
 */
router.get('/:id', userController.getUserById);

/**
 * @swagger
 * /api/v1/user/{id}:
 *   put:
 *     summary: Update a user
 *     tags: [Users]
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
 *               role_id:
 *                 type: integer
 *               userName:
 *                 type: string
 *               email:
 *                 type: string
 *               phone:
 *                 type: string
 *               password:
 *                 type: string
 *                 format: password
 *               profile_image:
 *                 type: string
 *                 format: binary
 *               address:
 *                 type: string
 *               latitude:
 *                 type: number
 *               longitude:
 *                 type: number
 *               is_verified:
 *                 type: boolean
 *               status:
 *                 type: string
 *                 enum: [active, inactive, pending]
 *     responses:
 *       200:
 *         description: User updated successfully
 *       404:
 *         description: User not found
 */
router.put('/:id', uploadImage('user').single('profile_image'), userController.updateUser);

/**
 * @swagger
 * /api/v1/user/{id}:
 *   delete:
 *     summary: Soft delete a user
 *     tags: [Users]
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
 *         description: User deleted successfully (soft delete)
 *       404:
 *         description: User not found
 */
router.delete('/:id', userController.deleteUser);

export default router;
