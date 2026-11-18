import express from 'express';
import { authenticate, optionalAuthenticate } from '../../middleware/auth.middleware.js';
import { requireBusinessOwnership } from '../../middleware/businessAuth.middleware.js';
import * as controller from './business_analytics.controller.js';

const router = express.Router();

// Resident/client batch or single storefront telemetry ingestion
router.post('/events', optionalAuthenticate, controller.trackStorefrontEvents);

// Business owner storefront analytics dashboard report (7D | 30D | 3M | 6M)
router.get('/business/:businessId', authenticate, requireBusinessOwnership, controller.getStorefrontAnalytics);

export default router;
