import express from 'express';
import { authenticate, optionalAuthenticate } from '../../middleware/auth.middleware.js';
import { requireBusinessOwnership } from '../../middleware/businessAuth.middleware.js';
import * as controller from './business_analytics.controller.js';

const router = express.Router();

// Resident submits a business inquiry / callback request
router.post('/', optionalAuthenticate, controller.submitLead);

// Business owner lead management
router.get('/business/:businessId', authenticate, requireBusinessOwnership, controller.getLeadsByBusiness);
router.patch('/:id/status', authenticate, controller.patchLeadStatus);
router.put('/:id/status', authenticate, controller.patchLeadStatus);

export default router;
