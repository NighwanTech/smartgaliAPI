import express from 'express';
import * as businessKycController from './business_kyc.controller.js';
import { uploadProviderDocument } from '../../utils/fileUpload.js';
import { authenticate, optionalAuthenticate, requireGlobalAdmin } from '../../middleware/auth.middleware.js';
import { requireBusinessOwnership } from '../../middleware/businessAuth.middleware.js';

const router = express.Router();

const businessDocUpload = uploadProviderDocument('business-documents').fields([
  { name: 'file', maxCount: 1 },
  { name: 'document', maxCount: 1 },
  { name: 'image', maxCount: 1 },
]);

const extractUploadedDoc = (req, res, next) => {
  businessDocUpload(req, res, (err) => {
    if (err) {
      return res.status(400).json({
        success: false,
        message: err.message || 'Invalid KYC document upload.',
      });
    }
    if (req.files) {
      req.file =
        req.files['file']?.[0] ||
        req.files['document']?.[0] ||
        req.files['image']?.[0] ||
        null;
    }
    next();
  });
};

// Public / Onboarding endpoints: 2-Layer dynamic KYC checklist resolution
router.get('/requirements', optionalAuthenticate, businessKycController.getRequirementsForCategory);

// Authenticated KYC document upload to /uploads/business-documents/
router.post(
  '/upload-document',
  authenticate,
  extractUploadedDoc,
  businessKycController.uploadBusinessKycDocument
);

// Dynamic Category Rule Management (Admin)
router.get('/rules', optionalAuthenticate, businessKycController.listRules);
router.post('/rules', authenticate, requireGlobalAdmin, businessKycController.createRule);
router.put('/rules/:ruleId', authenticate, requireGlobalAdmin, businessKycController.updateRule);
router.delete('/rules/:ruleId', authenticate, requireGlobalAdmin, businessKycController.deleteRule);

// Admin Applications Queue & Per-Document Verification
router.get('/applications', authenticate, requireGlobalAdmin, businessKycController.listApplicationsForAdmin);
router.put('/documents/:documentId/verify', authenticate, requireGlobalAdmin, businessKycController.verifyDocument);

// Business-specific documents CRUD
router.get(
  '/business/:businessId/documents',
  authenticate,
  businessKycController.getDocumentsForBusiness
);
router.post(
  '/business/:businessId/documents',
  authenticate,
  requireBusinessOwnership,
  businessKycController.saveDocumentsForBusiness
);

export default router;

