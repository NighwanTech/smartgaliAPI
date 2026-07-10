import express from 'express';
import * as ticketController from './ticket.controller.js';

const router = express.Router();

/**
 * @swagger
 * tags:
 *   name: Ticket
 *   description: Support Tickets endpoints
 */

/**
 * @swagger
 * /api/v1/ticket:
 *   post:
 *     summary: Create new support ticket
 *     tags: [Ticket]
 *     responses:
 *       201:
 *         description: Ticket created successfully
 */
router.post('/', ticketController.createTicket);

/**
 * @swagger
 * /api/v1/ticket:
 *   get:
 *     summary: Get all tickets
 *     tags: [Ticket]
 *     responses:
 *       200:
 *         description: Success
 */
router.get('/', ticketController.getAllTickets);

/**
 * @swagger
 * /api/v1/ticket/{id}:
 *   get:
 *     summary: Get ticket by ID
 *     tags: [Ticket]
 *     responses:
 *       200:
 *         description: Success
 */
router.get('/:id', ticketController.getTicketById);

/**
 * @swagger
 * /api/v1/ticket/{id}:
 *   put:
 *     summary: Update ticket
 *     tags: [Ticket]
 *     responses:
 *       200:
 *         description: Success
 */
router.put('/:id', ticketController.updateTicket);

/**
 * @swagger
 * /api/v1/ticket/{id}:
 *   delete:
 *     summary: Delete ticket
 *     tags: [Ticket]
 *     responses:
 *       200:
 *         description: Success
 */
router.delete('/:id', ticketController.deleteTicket);

export default router;
