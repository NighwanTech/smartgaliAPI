import express from 'express';
import * as residentDocumentController from './resident_document.controller.js';
import { authenticate } from '../../middleware/auth.middleware.js';
import { requireSocietyMember, requireSocietyRole } from '../../middleware/societyAuth.middleware.js';
import { uploadSocietyDocument } from '../../utils/fileUpload.js';
import {
  societyReadLimiter,
  societyMutationLimiter,
} from '../../middleware/rateLimit.middleware.js';

const router = express.Router();

router.post(
  '/',
  authenticate,
  societyMutationLimiter,
  uploadSocietyDocument('society').single('file'),
  requireSocietyMember,
  residentDocumentController.uploadResidentDocument
);

router.get(
  '/me',
  authenticate,
  societyReadLimiter,
  requireSocietyMember,
  residentDocumentController.getMyResidentDocuments
);

router.get(
  '/shared',
  authenticate,
  societyReadLimiter,
  requireSocietyRole(['admin', 'committee']),
  residentDocumentController.getSharedResidentDocuments
);

router.get(
  '/:id/download',
  authenticate,
  societyReadLimiter,
  requireSocietyMember,
  residentDocumentController.downloadResidentDocument
);

router.get(
  '/:id',
  authenticate,
  societyReadLimiter,
  requireSocietyMember,
  residentDocumentController.getResidentDocumentById
);

router.patch(
  '/:id/share',
  authenticate,
  societyMutationLimiter,
  requireSocietyMember,
  residentDocumentController.shareResidentDocument
);

router.patch(
  '/:id/verify',
  authenticate,
  societyMutationLimiter,
  requireSocietyRole(['admin', 'committee']),
  residentDocumentController.verifyResidentDocument
);

router.delete(
  '/:id',
  authenticate,
  societyMutationLimiter,
  requireSocietyMember,
  residentDocumentController.deleteResidentDocument
);

export default router;
