import express from 'express';
import {
  listDistricts,
  getDistrictById,
  createDistrict,
  updateDistrict,
  toggleDistrictStatus,
  listStates,
  getLocationSummary,
} from './admin_district.controller.js';
import {
  createDistrictSchema,
  updateDistrictSchema,
  toggleDistrictStatusSchema,
} from './admin_district.validation.js';
import { authenticate, requireSuperAdmin } from '../../middleware/auth.middleware.js';
import { validateBody } from '../../middleware/validation.middleware.js';

const router = express.Router();

// All administrative district mutation & management routes require Super Administrator authority
router.use(authenticate);
router.use(requireSuperAdmin);

// Location Master Overview & States
router.get('/summary', getLocationSummary);
router.get('/states', listStates);

// District CRUD routes
router.get('/districts', listDistricts);
router.get('/districts/:id', getDistrictById);
router.post('/districts', validateBody(createDistrictSchema), createDistrict);
router.put('/districts/:id', validateBody(updateDistrictSchema), updateDistrict);
router.patch('/districts/:id/status', validateBody(toggleDistrictStatusSchema), toggleDistrictStatus);

export default router;

