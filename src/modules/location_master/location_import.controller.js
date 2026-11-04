import multer from 'multer';
import {
  stageStateCsv,
  stageDistrictCsv,
  getImportPreview,
  confirmAndExecuteImport,
  listImportBatches,
  generateErrorReportCsv,
  generateSampleCsv,
} from './location_import.service.js';
import { LocationImportBatch } from './location_master.models.js';
import { successResponse, errorResponse } from '../../utils/response.js';
import logger from '../../utils/logger.js';

// Configure multer for in-memory file processing
export const uploadCsvMiddleware = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 25 * 1024 * 1024, // 25 MB max file size
  },
  fileFilter: (req, file, cb) => {
    const isCsvMime = file.mimetype === 'text/csv' ||
      file.mimetype === 'application/vnd.ms-excel' ||
      file.mimetype === 'text/plain' ||
      file.mimetype === 'application/csv';
    const isCsvExt = (file.originalname || '').toLowerCase().endsWith('.csv');

    if (isCsvMime || isCsvExt) {
      cb(null, true);
    } else {
      cb(new Error('Invalid file format. Only CSV (.csv) files are supported.'), false);
    }
  },
}).single('file');

/**
 * POST /api/v1/admin/locations/import/stage
 * Uploads, parses, validates, and stages State or District CSV dataset.
 * Does NOT alter production state or district master tables.
 */
export const stageImportCsv = async (req, res, next) => {
  try {
    if (!req.file || !req.file.buffer) {
      return errorResponse(res, 400, 'Please upload a valid CSV file using form-data field "file".');
    }

    let datasetType = (req.body.dataset_type || '').toUpperCase().trim();

    // Auto-detect dataset type from file content if not specified
    if (!datasetType) {
      const headerPreview = req.file.buffer.slice(0, 1024).toString('utf-8');
      if (headerPreview.toLowerCase().includes('district')) {
        datasetType = 'DISTRICT';
      } else if (headerPreview.toLowerCase().includes('state')) {
        datasetType = 'STATE';
      } else {
        return errorResponse(res, 400, 'dataset_type is required (must be "STATE" or "DISTRICT").');
      }
    }

    if (datasetType !== 'STATE' && datasetType !== 'DISTRICT') {
      return errorResponse(res, 400, 'Invalid dataset_type. Must be either "STATE" or "DISTRICT".');
    }

    const actorId = req.user?.id || req.user?.userId;
    let batch;

    if (datasetType === 'STATE') {
      batch = await stageStateCsv({
        fileBuffer: req.file.buffer,
        fileName: req.file.originalname,
        actorId,
      });
    } else {
      batch = await stageDistrictCsv({
        fileBuffer: req.file.buffer,
        fileName: req.file.originalname,
        actorId,
      });
    }

    return successResponse(
      res,
      201,
      `CSV staged successfully with ${batch.valid_rows} valid and ${batch.invalid_rows} invalid rows.`,
      batch
    );
  } catch (err) {
    logger.error('Error staging location CSV import:', err);
    return errorResponse(res, err.statusCode || 500, err.message || 'Failed to stage CSV import.');
  }
};

/**
 * GET /api/v1/admin/locations/import/preview/:batchId
 * Returns preview of staged records, error rows, and summary metrics.
 */
export const getBatchPreview = async (req, res, next) => {
  try {
    const { batchId } = req.params;
    if (!batchId) {
      return errorResponse(res, 400, 'batchId parameter is required.');
    }

    const preview = await getImportPreview(batchId);
    return successResponse(res, 200, 'Import preview retrieved successfully.', preview);
  } catch (err) {
    logger.error(`Error retrieving preview for batch ${req.params.batchId}:`, err);
    return errorResponse(res, err.statusCode || 500, err.message || 'Failed to fetch import preview.');
  }
};

/**
 * POST /api/v1/admin/locations/import/confirm/:batchId
 * Confirms and executes atomic database import within a single transaction.
 */
export const confirmBatchImport = async (req, res, next) => {
  try {
    const { batchId } = req.params;
    if (!batchId) {
      return errorResponse(res, 400, 'batchId parameter is required.');
    }

    const actorId = req.user?.id || req.user?.userId;
    const result = await confirmAndExecuteImport({
      batchId,
      actorId,
      options: req.body || {},
    });

    return successResponse(
      res,
      200,
      `Import completed successfully: ${result.imported} created, ${result.updated} updated, ${result.skipped} skipped.`,
      result
    );
  } catch (err) {
    logger.error(`Error confirming import batch ${req.params.batchId}:`, err);
    return errorResponse(res, err.statusCode || 500, err.message || 'Failed to execute import.');
  }
};

/**
 * GET /api/v1/admin/locations/import/batches
 * Lists all previous and ongoing import batches with filtering and pagination.
 */
export const listBatches = async (req, res, next) => {
  try {
    const result = await listImportBatches(req.query);
    return successResponse(
      res,
      200,
      'Import batches retrieved successfully.',
      result.batches,
      result.pagination
    );
  } catch (err) {
    logger.error('Error listing location import batches:', err);
    return errorResponse(res, err.statusCode || 500, err.message || 'Failed to list import batches.');
  }
};

/**
 * GET /api/v1/admin/locations/import/batches/:batchId
 * Retrieves detailed batch metadata and execution status.
 */
export const getBatchStatus = async (req, res, next) => {
  try {
    const { batchId } = req.params;
    const batch = await LocationImportBatch.findOne({
      where: { batch_id: batchId },
    });

    if (!batch) {
      return errorResponse(res, 404, 'Import batch not found.');
    }

    return successResponse(res, 200, 'Batch status retrieved successfully.', batch);
  } catch (err) {
    logger.error(`Error fetching status for batch ${req.params.batchId}:`, err);
    return errorResponse(res, err.statusCode || 500, err.message || 'Failed to fetch batch status.');
  }
};

/**
 * GET /api/v1/admin/locations/import/error-report/:batchId
 * Streams or downloads RFC 4180 compliant error report CSV.
 */
export const downloadErrorReport = async (req, res, next) => {
  try {
    const { batchId } = req.params;
    const csvContent = await generateErrorReportCsv(batchId);

    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="error-report-${batchId}.csv"`);
    res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
    return res.status(200).send(csvContent);
  } catch (err) {
    logger.error(`Error generating error report for batch ${req.params.batchId}:`, err);
    return errorResponse(res, err.statusCode || 500, err.message || 'Failed to download error report.');
  }
};

/**
 * GET /api/v1/admin/locations/import/sample-template/:type
 * Downloads an official LGD compliant CSV sample template with sample rows.
 */
export const downloadSampleTemplate = async (req, res, next) => {
  try {
    const type = (req.params.type || 'state').toUpperCase();
    if (type !== 'STATE' && type !== 'DISTRICT') {
      return errorResponse(res, 400, 'Invalid sample template type. Must be "state" or "district".');
    }

    const csvContent = generateSampleCsv(type);

    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="lgd-sample-${type.toLowerCase()}.csv"`);
    res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
    return res.status(200).send(csvContent);
  } catch (err) {
    logger.error(`Error generating sample template for ${req.params.type}:`, err);
    return errorResponse(res, err.statusCode || 500, err.message || 'Failed to download sample template.');
  }
};

