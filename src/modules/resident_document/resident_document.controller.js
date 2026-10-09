import { successResponse, errorResponse } from '../../utils/response.js';
import * as residentDocumentService from './resident_document.service.js';
import env from '../../config/env.js';

export const uploadResidentDocument = async (req, res, next) => {
  try {
    const userId = req.user?.id || req.user?.userId;
    const societyId = req.societyContext?.societyId || req.body.society_id || req.query.society_id;

    if (!societyId) {
      return errorResponse(res, 400, 'society_id is required');
    }

    if (!req.file && !req.body.file_url) {
      return errorResponse(res, 400, 'Document file or file_url is required');
    }

    const fileUrl = req.file
      ? `${env.publicMediaOrigin}/uploads/society/${req.file.filename}`
      : req.body.file_url;

    const payload = {
      title: req.body.title,
      description: req.body.description,
      document_type: req.body.document_type || req.body.category || 'other',
      flat_number: req.body.flat_number,
      status: req.body.status || 'private',
      file_url: fileUrl,
      file_type: req.file ? req.file.mimetype : req.body.file_type,
      file_size: req.file ? req.file.size : req.body.file_size,
    };

    const doc = await residentDocumentService.uploadResidentDocument(societyId, userId, payload, {
      requestId: req.correlationId,
      ip: req.ip,
      userAgent: req.headers['user-agent'],
    });

    return successResponse(res, 201, 'Personal document uploaded successfully', doc);
  } catch (error) {
    return next(error);
  }
};

export const getMyResidentDocuments = async (req, res, next) => {
  try {
    const userId = req.user?.id || req.user?.userId;
    const societyId = req.societyContext?.societyId || req.query.society_id;

    if (!societyId) {
      return errorResponse(res, 400, 'society_id is required');
    }

    const docs = await residentDocumentService.getMyResidentDocuments(societyId, userId, req.query);
    return successResponse(res, 200, 'Personal vault documents retrieved successfully', docs);
  } catch (error) {
    return next(error);
  }
};

export const getSharedResidentDocuments = async (req, res, next) => {
  try {
    const societyId = req.societyContext?.societyId || req.query.society_id;

    if (!societyId) {
      return errorResponse(res, 400, 'society_id is required');
    }

    const docs = await residentDocumentService.getSharedResidentDocuments(societyId, req.query);
    return successResponse(res, 200, 'Shared resident documents retrieved successfully', docs);
  } catch (error) {
    return next(error);
  }
};

export const getResidentDocumentById = async (req, res, next) => {
  try {
    const societyId = req.societyContext?.societyId || req.query.society_id;
    const doc = await residentDocumentService.getResidentDocumentById(req.params.id, societyId);
    if (!doc) return errorResponse(res, 404, 'Resident document not found');
    return successResponse(res, 200, 'Resident document retrieved successfully', doc);
  } catch (error) {
    return next(error);
  }
};

export const shareResidentDocument = async (req, res, next) => {
  try {
    const userId = req.user?.id || req.user?.userId;
    const societyId = req.societyContext?.societyId || req.body.society_id;

    const doc = await residentDocumentService.shareResidentDocument(req.params.id, societyId, userId, {
      requestId: req.correlationId,
      ip: req.ip,
      userAgent: req.headers['user-agent'],
    });

    if (!doc) return errorResponse(res, 404, 'Resident document not found');
    return successResponse(res, 200, 'Document shared for verification', doc);
  } catch (error) {
    return next(error);
  }
};

export const verifyResidentDocument = async (req, res, next) => {
  try {
    const adminUserId = req.user?.id || req.user?.userId;
    const societyId = req.societyContext?.societyId || req.body.society_id;
    const { status, rejection_reason } = req.body;

    if (!status) return errorResponse(res, 400, 'status is required');

    const doc = await residentDocumentService.verifyResidentDocument(
      req.params.id,
      societyId,
      adminUserId,
      { status, rejection_reason },
      {
        requestId: req.correlationId,
        ip: req.ip,
        userAgent: req.headers['user-agent'],
      }
    );

    if (!doc) return errorResponse(res, 404, 'Resident document not found');
    return successResponse(res, 200, 'Document verification status updated', doc);
  } catch (error) {
    return next(error);
  }
};

export const deleteResidentDocument = async (req, res, next) => {
  try {
    const userId = req.user?.id || req.user?.userId;
    const societyId = req.societyContext?.societyId || req.query.society_id;
    const remarks = req.body?.remarks || req.query?.remarks;

    const ok = await residentDocumentService.deleteResidentDocument(req.params.id, societyId, userId, remarks, {
      requestId: req.correlationId,
      ip: req.ip,
      userAgent: req.headers['user-agent'],
    });

    if (!ok) return errorResponse(res, 404, 'Resident document not found');
    return successResponse(res, 200, 'Personal document deleted successfully');
  } catch (error) {
    return next(error);
  }
};

export const downloadResidentDocument = async (req, res, next) => {
  try {
    const societyId = req.societyContext?.societyId || req.query.society_id;
    const doc = await residentDocumentService.getResidentDocumentById(req.params.id, societyId);
    if (!doc) return errorResponse(res, 404, 'Resident document not found');

    if (doc.file_url.startsWith('http://') || doc.file_url.startsWith('https://')) {
      return res.redirect(doc.file_url);
    }
    return res.redirect(`${env.publicMediaOrigin}/${doc.file_url.replace(/^\//, '')}`);
  } catch (error) {
    return next(error);
  }
};
