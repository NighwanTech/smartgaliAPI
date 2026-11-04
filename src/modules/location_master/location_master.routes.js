import express from 'express';
import {
  getCountries,
  getStates,
  getDistricts,
  getDistrictById,
  getCities,
  getLocalities,
  getPincodes,
  getLocationHierarchy,
} from './location_master.controller.js';

const router = express.Router();

// Public / Authenticated Discovery
router.get('/countries', getCountries);
router.get('/states', getStates);
router.get('/districts', getDistricts);
router.get('/districts/:id', getDistrictById);
router.get('/cities', getCities);
router.get('/localities', getLocalities);
router.get('/pincodes', getPincodes);
router.get('/hierarchy', getLocationHierarchy);

export default router;
