import { successResponse, errorResponse } from '../../utils/response.js';
import * as businessProfileService from './business_profile.service.js';
import { getImageUrl } from '../../utils/fileUpload.js';

const formatProfile = (profile) => {
  if (!profile) return null;
  const json = typeof profile.toJSON === 'function' ? profile.toJSON() : { ...profile };
  return {
    ...json,
    business_name: json.businessName || json.business_name,
    businessName: json.businessName || json.business_name,
    rating: json.rating !== undefined ? json.rating : null,
    reviewCount: json.reviewCount !== undefined ? json.reviewCount : null,
  };
};

export const createProfile = async (req, res, next) => {
  try {
    const data = { ...req.body };
    data.businessName = data.businessName || data.business_name || data.name;
    if (req.user?.id || req.user?.userId) {
      data.userId = req.user.id || req.user.userId;
    }
    if (req.file) {
      data.logo = getImageUrl(req, req.file, 'business');
    }
    const profile = await businessProfileService.createProfile(data);
    return successResponse(res, 201, 'Business profile created successfully', formatProfile(profile));
  } catch (error) {
    next(error);
  }
};

export const getAllProfiles = async (req, res, next) => {
  try {
    const profiles = await businessProfileService.getAllProfiles(req.query);
    const formatted = Array.isArray(profiles) ? profiles.map(formatProfile) : profiles;
    return successResponse(res, 200, 'Business profiles fetched successfully', formatted);
  } catch (error) {
    next(error);
  }
};

export const getProfileById = async (req, res, next) => {
  try {
    const profile = await businessProfileService.getProfileById(req.params.id);
    if (!profile) {
      return errorResponse(res, 404, 'Business profile not found');
    }
    return successResponse(res, 200, 'Business profile fetched successfully', formatProfile(profile));
  } catch (error) {
    next(error);
  }
};

export const updateProfile = async (req, res, next) => {
  try {
    const data = { ...req.body };
    if (data.business_name || data.name || data.businessName) {
      data.businessName = data.businessName || data.business_name || data.name;
    }
    if (req.file) {
      data.logo = getImageUrl(req, req.file, 'business');
    }
    const profile = await businessProfileService.updateProfile(req.params.id, data);
    if (!profile) {
      return errorResponse(res, 404, 'Business profile not found');
    }
    return successResponse(res, 200, 'Business profile updated successfully', formatProfile(profile));
  } catch (error) {
    next(error);
  }
};

export const deleteProfile = async (req, res, next) => {
  try {
    const { deletedRemarks, updated_by } = req.body || {};
    const profile = await businessProfileService.softDeleteProfile(req.params.id, deletedRemarks, updated_by);
    if (!profile) {
      return errorResponse(res, 404, 'Business profile not found');
    }
    return successResponse(res, 200, 'Business profile deleted successfully (soft delete)', null);
  } catch (error) {
    next(error);
  }
};

export const approveProfile = async (req, res, next) => {
  try {
    const { updated_by } = req.body || {};
    const profile = await businessProfileService.approveProfile(req.params.id, updated_by);
    if (!profile) {
      return errorResponse(res, 404, 'Business profile not found');
    }
    return successResponse(res, 200, 'Business profile approved successfully', formatProfile(profile));
  } catch (error) {
    next(error);
  }
};

export const rejectProfile = async (req, res, next) => {
  try {
    const { rejectRemarks, updated_by } = req.body || {};
    const profile = await businessProfileService.rejectProfile(req.params.id, rejectRemarks, updated_by);
    if (!profile) {
      return errorResponse(res, 404, 'Business profile not found');
    }
    return successResponse(res, 200, 'Business profile rejected successfully', formatProfile(profile));
  } catch (error) {
    next(error);
  }
};

export const featureProfile = async (req, res, next) => {
  try {
    const { updated_by } = req.body || {};
    const profile = await businessProfileService.featureProfile(req.params.id, updated_by);
    if (!profile) {
      return errorResponse(res, 404, 'Business profile not found');
    }
    return successResponse(res, 200, 'Business profile featured successfully', formatProfile(profile));
  } catch (error) {
    next(error);
  }
};

export const unfeatureProfile = async (req, res, next) => {
  try {
    const { updated_by } = req.body || {};
    const profile = await businessProfileService.unfeatureProfile(req.params.id, updated_by);
    if (!profile) {
      return errorResponse(res, 404, 'Business profile not found');
    }
    return successResponse(res, 200, 'Business profile unfeatured successfully', formatProfile(profile));
  } catch (error) {
    next(error);
  }
};

export const getMyProfile = async (req, res, next) => {
  try {
    const userId = req.user?.id || req.user?.userId;
    const profile = await businessProfileService.getProfileByUserId(userId);
    if (!profile) {
      return errorResponse(res, 404, 'Business profile not found');
    }
    return successResponse(res, 200, 'Business profile fetched successfully', formatProfile(profile));
  } catch (error) {
    next(error);
  }
};

export const getDashboardStats = async (req, res, next) => {
  try {
    const userId = req.user?.id || req.user?.userId;
    const stats = await businessProfileService.getDashboardStats(userId);
    return successResponse(res, 200, 'Dashboard stats fetched successfully', stats);
  } catch (error) {
    next(error);
  }
};
