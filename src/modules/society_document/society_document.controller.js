import { successResponse, errorResponse } from '../../utils/response.js';
import * as societyDocumentService from './society_document.service.js';
import env from '../../config/env.js';

export const createDocument = async (req, res, next) => {
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
      document_number: req.body.document_number,
      version: req.body.version || '1.0',
      description: req.body.description,
      category: req.body.category,
      priority: req.body.priority || 'normal',
      visibility: req.body.visibility || 'all',
      allowed_roles: req.body.allowed_roles,
      tags: req.body.tags,
      requires_approval: req.body.requires_approval,
      acknowledgement_required: req.body.acknowledgement_required,
      effective_from: req.body.effective_from,
      expiry_date: req.body.expiry_date,
      scheduled_publish_at: req.body.scheduled_publish_at,
      status: req.body.status || 'published',
      is_official: req.body.is_official,
      file_url: fileUrl,
      file_type: req.file ? req.file.mimetype : req.body.file_type,
      file_size: req.file ? req.file.size : req.body.file_size,
    };

    const doc = await societyDocumentService.createDocument(societyId, userId, payload, {
      requestId: req.correlationId,
      ip: req.ip,
      userAgent: req.headers['user-agent'],
    });

    return successResponse(res, 201, 'Society document uploaded successfully', doc);
  } catch (error) {
    return next(error);
  }
};

export const getAllDocuments = async (req, res, next) => {
  try {
    const societyId = req.societyContext?.societyId || req.query.society_id;
    if (!societyId) {
      return errorResponse(res, 400, 'society_id is required');
    }
    const result = await societyDocumentService.getAllDocuments(societyId, req.query);
    return successResponse(res, 200, 'Society documents retrieved successfully', result.data, {
      total: result.total,
      page: result.page,
      limit: result.limit,
      totalPages: result.totalPages,
    });
  } catch (error) {
    return next(error);
  }
};

export const getDocumentById = async (req, res, next) => {
  try {
    const societyId = req.societyContext?.societyId || req.query.society_id;
    const doc = await societyDocumentService.getDocumentById(req.params.id, societyId);
    if (!doc) return errorResponse(res, 404, 'Society document not found');
    return successResponse(res, 200, 'Society document retrieved successfully', doc);
  } catch (error) {
    return next(error);
  }
};

export const updateDocument = async (req, res, next) => {
  try {
    const userId = req.user?.id || req.user?.userId;
    const societyId = req.societyContext?.societyId || req.query?.society_id || req.body?.society_id;
    const doc = await societyDocumentService.updateDocument(req.params.id, societyId, req.body, userId, {
      requestId: req.correlationId,
      ip: req.ip,
      userAgent: req.headers['user-agent'],
    });
    if (!doc) return errorResponse(res, 404, 'Society document not found');
    return successResponse(res, 200, 'Society document updated successfully', doc);
  } catch (error) {
    return next(error);
  }
};

export const createDocumentVersion = async (req, res, next) => {
  try {
    const userId = req.user?.id || req.user?.userId;
    const societyId = req.societyContext?.societyId || req.body.society_id || req.query.society_id;

    if (!req.file && !req.body.file_url) {
      return errorResponse(res, 400, 'Version document file or file_url is required');
    }

    const fileUrl = req.file
      ? `${env.publicMediaOrigin}/uploads/society/${req.file.filename}`
      : req.body.file_url;

    const payload = {
      version: req.body.version,
      title: req.body.title,
      change_summary: req.body.change_summary,
      file_url: fileUrl,
      file_type: req.file ? req.file.mimetype : req.body.file_type,
      file_size: req.file ? req.file.size : req.body.file_size,
    };

    const doc = await societyDocumentService.createDocumentVersion(req.params.id, societyId, userId, payload, {
      requestId: req.correlationId,
      ip: req.ip,
      userAgent: req.headers['user-agent'],
    });

    if (!doc) return errorResponse(res, 404, 'Society document not found');
    return successResponse(res, 201, 'Document version created successfully', { document: doc });
  } catch (error) {
    return next(error);
  }
};

export const getDocumentVersions = async (req, res, next) => {
  try {
    const societyId = req.societyContext?.societyId || req.query.society_id;
    const versions = await societyDocumentService.getDocumentVersions(req.params.id, societyId);
    return successResponse(res, 200, 'Document versions retrieved successfully', versions);
  } catch (error) {
    return next(error);
  }
};

export const updateDocumentStatus = async (req, res, next) => {
  try {
    const userId = req.user?.id || req.user?.userId;
    const societyId = req.societyContext?.societyId || req.body.society_id;
    const { status, reason } = req.body;

    if (!status) return errorResponse(res, 400, 'status is required');

    const doc = await societyDocumentService.updateDocumentStatus(req.params.id, societyId, userId, { status, reason }, {
      requestId: req.correlationId,
      ip: req.ip,
      userAgent: req.headers['user-agent'],
    });

    if (!doc) return errorResponse(res, 404, 'Society document not found');
    return successResponse(res, 200, 'Document status updated successfully', doc);
  } catch (error) {
    return next(error);
  }
};

export const acknowledgeDocument = async (req, res, next) => {
  try {
    const userId = req.user?.id || req.user?.userId;
    const societyId = req.societyContext?.societyId || req.body.society_id;
    const { version } = req.body;

    const ack = await societyDocumentService.acknowledgeDocument(req.params.id, societyId, userId, version, {
      requestId: req.correlationId,
      ip: req.ip,
      userAgent: req.headers['user-agent'],
    });

    if (!ack) return errorResponse(res, 404, 'Society document not found');
    return successResponse(res, 200, 'Document acknowledged successfully', ack);
  } catch (error) {
    return next(error);
  }
};

export const getDocumentAcknowledgements = async (req, res, next) => {
  try {
    const societyId = req.societyContext?.societyId || req.query.society_id;
    const result = await societyDocumentService.getDocumentAcknowledgements(req.params.id, societyId);
    return successResponse(res, 200, 'Document acknowledgements retrieved successfully', result);
  } catch (error) {
    return next(error);
  }
};

export const getDocumentAuditHistory = async (req, res, next) => {
  try {
    const societyId = req.societyContext?.societyId || req.query.society_id;
    const history = await societyDocumentService.getDocumentAuditHistory(req.params.id, societyId);
    return successResponse(res, 200, 'Document audit history retrieved successfully', history);
  } catch (error) {
    return next(error);
  }
};

export const deleteDocument = async (req, res, next) => {
  try {
    const userId = req.user?.id || req.user?.userId;
    const societyId = req.societyContext?.societyId || req.query.society_id;
    const deleted = await societyDocumentService.deleteDocument(req.params.id, societyId, userId, {
      remarks: req.body?.remarks || req.body?.deletedRemarks,
      requestId: req.correlationId,
      ip: req.ip,
      userAgent: req.headers['user-agent'],
    });
    if (!deleted) return errorResponse(res, 404, 'Society document not found');
    return successResponse(res, 200, 'Society document deleted successfully');
  } catch (error) {
    return next(error);
  }
};
