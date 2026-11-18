import { successResponse, errorResponse } from '../../utils/response.js';
import { getImageUrl } from '../../utils/fileUpload.js';
import { isGlobalAdminUser } from '../../middleware/auth.middleware.js';
import BusinessProfile from '../business_profile/business_profile.model.js';
import * as businessKycService from './business_kyc.service.js';

export const getRequirementsForCategory = async (req, res, next) => {
  try {
    const categoryId = req.params.id ?? req.query.category_id ?? req.query.categoryId;
    const categoryName = req.query.category_name ?? req.query.category;
    const sellsBranded = req.query.sells_branded_goods ?? req.query.sellsBrandedGoods ?? false;
    const gstExempt = req.query.gst_exempt ?? req.query.gstExempt ?? false;
    const includeInapplicable = req.query.include_all === 'true';

    const result = await businessKycService.getRequirementsForCategory({
      category_id: categoryId,
      category_name: categoryName,
      sells_branded_goods: sellsBranded,
      gst_exempt: gstExempt,
      includeInapplicable,
    });
    return successResponse(res, 200, 'Dynamic 2-layer business KYC requirements fetched successfully', result);
  } catch (error) {
    next(error);
  }
};

export const uploadBusinessKycDocument = async (req, res) => {
  try {
    if (!req.file) {
      return errorResponse(res, 400, 'No document file uploaded.');
    }
    const url = getImageUrl(req, req.file, 'business-documents');
    return successResponse(res, 201, 'KYC document uploaded successfully', {
      url,
      file_url: url,
      file_name: req.file.originalname || req.file.filename,
      filename: req.file.filename,
      mime_type: req.file.mimetype,
      file_size: req.file.size,
      doc_code: req.body?.doc_code || null,
    });
  } catch (error) {
    return errorResponse(res, 400, error.message || 'Failed to upload KYC document.');
  }
};

export const listRules = async (req, res, next) => {
  try {
    const rules = await businessKycService.listAllKycRules({
      category_id: req.query.category_id,
    });
    return successResponse(res, 200, 'Business KYC rules fetched successfully', rules);
  } catch (error) {
    next(error);
  }
};

export const createRule = async (req, res, next) => {
  try {
    const adminId = req.user?.id || req.user?.userId || null;
    const created = await businessKycService.createKycRule(req.body, adminId);
    return successResponse(res, 201, 'Business KYC rule created successfully', created);
  } catch (error) {
    if (error.statusCode === 400) return errorResponse(res, 400, error.message);
    next(error);
  }
};

export const updateRule = async (req, res, next) => {
  try {
    const adminId = req.user?.id || req.user?.userId || null;
    const updated = await businessKycService.updateKycRule(req.params.ruleId, req.body, adminId);
    if (!updated) return errorResponse(res, 404, 'KYC rule not found');
    return successResponse(res, 200, 'Business KYC rule updated successfully', updated);
  } catch (error) {
    next(error);
  }
};

export const deleteRule = async (req, res, next) => {
  try {
    const adminId = req.user?.id || req.user?.userId || null;
    const ok = await businessKycService.deleteKycRule(req.params.ruleId, adminId);
    if (!ok) return errorResponse(res, 404, 'KYC rule not found');
    return successResponse(res, 200, 'Business KYC rule deleted successfully', null);
  } catch (error) {
    next(error);
  }
};

export const getDocumentsForBusiness = async (req, res, next) => {
  try {
    const businessId = req.params.businessId || req.params.id;
    const profile = await BusinessProfile.findOne({
      where: { id: businessId, is_deleted: false },
    });
    if (!profile) return errorResponse(res, 404, 'Business profile not found');

    const requesterId = req.user?.id || req.user?.userId;
    const isOwner = requesterId && Number(profile.userId) === Number(requesterId);
    const isAdmin = isGlobalAdminUser(req.user);
    if (!isOwner && !isAdmin) {
      return errorResponse(res, 403, 'Access denied: Only the business owner or admin can view KYC documents.');
    }

    const docs = await businessKycService.getDocumentsForBusiness(profile.id);
    return successResponse(res, 200, 'Business KYC documents fetched successfully', docs);
  } catch (error) {
    next(error);
  }
};

export const saveDocumentsForBusiness = async (req, res, next) => {
  try {
    const businessId = req.params.businessId || req.params.id;
    const profile = await BusinessProfile.findOne({
      where: { id: businessId, is_deleted: false },
    });
    if (!profile) return errorResponse(res, 404, 'Business profile not found');

    const userId = req.user?.id || req.user?.userId || profile.userId;
    const incomingDocs = Array.isArray(req.body?.documents)
      ? req.body.documents
      : req.body?.doc_code
        ? [req.body]
        : [];

    if (incomingDocs.length === 0) {
      return errorResponse(res, 400, 'At least one document payload is required.');
    }

    const saved = await businessKycService.saveBusinessDocuments(profile.id, userId, incomingDocs);
    if (profile.verification_status === 'rejected') {
      await profile.update({
        verification_status: 'under_review',
        rejection_reason: null,
        submitted_at: new Date(),
        updated_by: userId,
        updatedAt: new Date(),
      });
    }
    return successResponse(res, 201, 'Business KYC documents saved successfully', saved);
  } catch (error) {
    if (error.statusCode === 400) return errorResponse(res, 400, error.message);
    next(error);
  }
};

export const verifyDocument = async (req, res, next) => {
  try {
    const verifierId = req.user?.id || req.user?.userId || null;
    const updated = await businessKycService.verifyBusinessDocument(req.params.documentId, {
      status: req.body?.status,
      admin_remark: req.body?.admin_remark ?? req.body?.remark,
      verifierId,
    });
    if (!updated) return errorResponse(res, 404, 'Business document not found');
    return successResponse(res, 200, 'Business document verification status updated', updated);
  } catch (error) {
    if (error.statusCode === 400) return errorResponse(res, 400, error.message);
    next(error);
  }
};

export const listApplicationsForAdmin = async (req, res, next) => {
  try {
    const applications = await businessKycService.listApplicationsForAdmin({
      status: req.query.status,
      category_id: req.query.category_id,
      search: req.query.search,
    });
    return successResponse(res, 200, 'Business KYC applications fetched successfully', applications);
  } catch (error) {
    next(error);
  }
};

