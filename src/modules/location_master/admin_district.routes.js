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
import {
  listCities,
  getCityById,
  createCity,
  updateCity,
  toggleCityStatus,
} from './admin_city.controller.js';
import {
  createCitySchema,
  updateCitySchema,
  toggleCityStatusSchema,
} from './admin_city.validation.js';
import {
  listLocalities,
  getLocalityById,
  createLocality,
  updateLocality,
  toggleLocalityStatus,
} from './admin_locality.controller.js';
import {
  createLocalitySchema,
  updateLocalitySchema,
  toggleLocalityStatusSchema,
} from './admin_locality.validation.js';
import {
  listPincodes,
  getPincodeById,
  createPincode,
  updatePincode,
  togglePincodeStatus,
  linkLocalityPincode,
  unlinkLocalityPincode,
} from './admin_pincode.controller.js';
import {
  createPincodeSchema,
  updatePincodeSchema,
  togglePincodeStatusSchema,
  linkLocalityPincodeSchema,
} from './admin_pincode.validation.js';
import { authenticate, requireSuperAdmin } from '../../middleware/auth.middleware.js';
import { validateBody } from '../../middleware/validation.middleware.js';

const router = express.Router();

// All administrative location master mutation & management routes require Super Administrator authority
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

// City CRUD routes
router.get('/cities', listCities);
router.get('/cities/:id', getCityById);
router.post('/cities', validateBody(createCitySchema), createCity);
router.put('/cities/:id', validateBody(updateCitySchema), updateCity);
router.patch('/cities/:id/status', validateBody(toggleCityStatusSchema), toggleCityStatus);

// Locality CRUD routes
router.get('/localities', listLocalities);
router.get('/localities/:id', getLocalityById);
router.post('/localities', validateBody(createLocalitySchema), createLocality);
router.put('/localities/:id', validateBody(updateLocalitySchema), updateLocality);
router.patch('/localities/:id/status', validateBody(toggleLocalityStatusSchema), toggleLocalityStatus);

// PIN Code CRUD & Mapping routes
router.get('/pincodes', listPincodes);
router.get('/pincodes/:id', getPincodeById);
router.post('/pincodes', validateBody(createPincodeSchema), createPincode);
router.put('/pincodes/:id', validateBody(updatePincodeSchema), updatePincode);
router.patch('/pincodes/:id/status', validateBody(togglePincodeStatusSchema), togglePincodeStatus);
router.post('/pincodes/:id/localities', validateBody(linkLocalityPincodeSchema), linkLocalityPincode);
router.delete('/pincodes/:id/localities/:locality_id', unlinkLocalityPincode);

export default router;
