import express from 'express';
import * as cmsController from './cms.controller.js';

const router = express.Router();

/**
 * @swagger
 * tags:
 *   name: CMS
 *   description: Content Management System endpoints
 */

/**
 * @swagger
 * /api/v1/cms:
 *   post:
 *     summary: Create new CMS content
 *     tags: [CMS]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - title
 *               - slug
 *               - content
 *             properties:
 *               title:
 *                 type: string
 *               slug:
 *                 type: string
 *               content:
 *                 type: string
 *               type:
 *                 type: string
 *                 enum: [page, faq, policy]
 *               status:
 *                 type: string
 *                 enum: [active, inactive]
 *     responses:
 *       201:
 *         description: CMS content created successfully
 */
router.post('/', cmsController.createCms);

/**
 * @swagger
 * /api/v1/cms:
 *   get:
 *     summary: Get all CMS content
 *     tags: [CMS]
 *     responses:
 *       200:
 *         description: Success
 */
router.get('/', cmsController.getAllCms);

/**
 * @swagger
 * /api/v1/cms/slug/{slug}:
 *   get:
 *     summary: Get CMS content by slug
 *     tags: [CMS]
 *     parameters:
 *       - in: path
 *         name: slug
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Success
 */
router.get('/slug/:slug', cmsController.getCmsBySlug);

/**
 * @swagger
 * /api/v1/cms/{id}:
 *   get:
 *     summary: Get CMS content by ID
 *     tags: [CMS]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Success
 */
router.get('/:id', cmsController.getCmsById);

/**
 * @swagger
 * /api/v1/cms/{id}:
 *   put:
 *     summary: Update CMS content
 *     tags: [CMS]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               title:
 *                 type: string
 *               slug:
 *                 type: string
 *               content:
 *                 type: string
 *               type:
 *                 type: string
 *                 enum: [page, faq, policy]
 *               status:
 *                 type: string
 *                 enum: [active, inactive]
 *     responses:
 *       200:
 *         description: Success
 */
router.put('/:id', cmsController.updateCms);

/**
 * @swagger
 * /api/v1/cms/{id}:
 *   delete:
 *     summary: Delete CMS content
 *     tags: [CMS]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Success
 */
router.delete('/:id', cmsController.deleteCms);

export default router;
