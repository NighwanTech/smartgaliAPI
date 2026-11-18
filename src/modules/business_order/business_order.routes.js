import express from 'express';
import * as orderController from './business_order.controller.js';
import { authenticate, optionalAuthenticate } from '../../middleware/auth.middleware.js';
import { requireBusinessOwnership } from '../../middleware/businessAuth.middleware.js';
import { validateBody } from '../../middleware/validation.middleware.js';
import {
  quoteOrderSchema,
  createOrderSchema,
  updateOrderStatusSchema,
  cancelOrderSchema,
  createRazorpayOrderSchema,
  verifyRazorpayPaymentSchema,
  refundOrderSchema,
} from './business_order.validation.js';

const router = express.Router();

// Cart quote preview (works for signed-in users & storefront previews)
router.post('/quote', optionalAuthenticate, validateBody(quoteOrderSchema), orderController.quoteOrder);

// Razorpay Payment Gateway routes
router.get('/razorpay/config', optionalAuthenticate, orderController.getRazorpayConfig);
router.post('/razorpay/create-order', optionalAuthenticate, validateBody(createRazorpayOrderSchema), orderController.createRazorpayOrder);
router.post('/razorpay/verify-payment', optionalAuthenticate, validateBody(verifyRazorpayPaymentSchema), orderController.verifyRazorpayPayment);
router.post('/razorpay/webhook', orderController.handleRazorpayWebhook);

// All persistent order routes require authentication
router.use(authenticate);

// Customer / Resident order endpoints
router.post('/', validateBody(createOrderSchema), orderController.createOrder);
router.get('/my', orderController.getMyOrders);

// Business Owner order dashboard endpoint
router.get('/business/:businessId', requireBusinessOwnership, orderController.getBusinessOrders);

// Single order detail, lifecycle updates & refunds
router.get('/:id', orderController.getOrderById);
router.post('/:id/cancel', validateBody(cancelOrderSchema), orderController.cancelOrderByCustomer);
router.patch('/:id/status', validateBody(updateOrderStatusSchema), orderController.updateOrderStatus);
router.post('/:id/status', validateBody(updateOrderStatusSchema), orderController.updateOrderStatus);
router.post('/:id/refund', validateBody(refundOrderSchema), orderController.refundOrderPayment);

export default router;

