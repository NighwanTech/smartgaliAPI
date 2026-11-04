import express from 'express';
import {
  uploadCsvMiddleware,
  stageImportCsv,
  getBatchPreview,
  confirmBatchImport,
  listBatches,
  getBatchStatus,
  downloadErrorReport,
  downloadSampleTemplate,
} from './location_import.controller.js';
import { authenticate, requireSuperAdmin } from '../../middleware/auth.middleware.js';

const router = express.Router();

// Bulk location import endpoints are strictly restricted to Super Administrators
router.use(authenticate);
router.use(requireSuperAdmin);

// CSV Upload & Staging
router.post('/stage', uploadCsvMiddleware, stageImportCsv);

// Preview staged records & validation details
router.get('/preview/:batchId', getBatchPreview);

// Confirm and execute transactional import
router.post('/confirm/:batchId', confirmBatchImport);

// Import history and batch status
router.get('/batches', listBatches);
router.get('/batches/:batchId', getBatchStatus);

// Export & Template downloads
router.get('/error-report/:batchId', downloadErrorReport);
router.get('/sample-template/:type', downloadSampleTemplate);

export default router;

