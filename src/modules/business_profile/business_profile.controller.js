import { successResponse, errorResponse } from '../../utils/response.js';
import * as businessProfileService from './business_profile.service.js';
import { getImageUrl } from '../../utils/fileUpload.js';

export const createProfile = async (req, res, next) => {
  try {
    const data = { ...req.body };
    const userId = req.user?.userId || data.user_id || data.userId;
    data.user_id = userId;
    data.created_by = userId;
    if (data.name !== undefined && data.business_name === undefined) {
      data.business_name = data.name;
    }
    if (data.contactNumber !== undefined && data.phone === undefined) {
      data.phone = data.contactNumber;
    }
    if (data.category !== undefined && data.serviceCategory === undefined) {
      data.serviceCategory = data.category;
    }
    if (req.file) {
      data.logo = getImageUrl(req, req.file, 'business');
    }
    const profile = await businessProfileService.createProfile(data);
    return successResponse(res, 201, 'Business profile created successfully', profile);
  } catch (error) {
    next(error);
  }
};

export const getAllProfiles = async (req, res, next) => {
  try {
    const profiles = await businessProfileService.getAllProfiles(req.query);
    return successResponse(res, 200, 'Business profiles fetched successfully', profiles);
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
    return successResponse(res, 200, 'Business profile fetched successfully', profile);
  } catch (error) {
    next(error);
  }
};

export const getMyProfile = async (req, res, next) => {
  try {
    const userId = req.user?.userId || req.user?.id;
    if (!userId) {
      return errorResponse(res, 401, 'User ID missing in auth token');
    }
    const profile = await businessProfileService.getProfileByUserId(userId);
    if (!profile) {
      return errorResponse(res, 404, 'Business profile not found');
    }
    const { rating, reviewCount } = await businessProfileService.getReviewStats(profile.id);
    const formatted = {
      id: Number(profile.id),
      userId: Number(profile.user_id),
      businessName: profile.business_name,
      categoryId: profile.category_id ? Number(profile.category_id) : null,
      categoryName: profile.category?.name || profile.serviceCategory || 'Local Business',
      description: profile.description || null,
      address: profile.address || null,
      phone: profile.user?.phone || profile.phone || null,
      email: profile.user?.email || profile.email || null,
      operatingHours: profile.operatingHours || null,
      bannerUrl: profile.bannerUrl || profile.logo || null,
      logoUrl: profile.logo || null,
      isVerified: Boolean(profile.is_verified),
      rating: rating,
      reviewCount: reviewCount,
      isOpen: profile.is_active !== false,
    };
    return successResponse(res, 200, 'Business profile fetched successfully', formatted);
  } catch (error) {
    next(error);
  }
};

export const getDashboardStats = async (req, res, next) => {
  try {
    const userId = req.user.userId;
    const stats = await businessProfileService.getDashboardStats(userId);
    if (!stats) {
      return errorResponse(res, 404, 'Business profile not found for user');
    }
    return successResponse(res, 200, 'Business dashboard stats fetched successfully', stats);
  } catch (error) {
    next(error);
  }
};

export const updateProfile = async (req, res, next) => {
  try {
    const data = { ...req.body };
    // Map Flutter 'name' -> DB 'business_name'
    if (data.name !== undefined && data.business_name === undefined) {
      data.business_name = data.name;
    }
    if (req.file) {
      data.logo = getImageUrl(req, req.file, 'business');
    }

    const existingProfile = await businessProfileService.getProfileById(req.params.id);
    if (!existingProfile) {
      return errorResponse(res, 404, 'Business profile not found');
    }

    // Authenticated user ownership check
    if (req.user && Number(existingProfile.user_id) !== Number(req.user.userId)) {
      return errorResponse(res, 403, 'Forbidden: You do not own this business profile');
    }

    const profile = await businessProfileService.updateProfile(req.params.id, data);
    return successResponse(res, 200, 'Business profile updated successfully', profile);
  } catch (error) {
    next(error);
  }
};

export const deleteProfile = async (req, res, next) => {
  try {
    const existingProfile = await businessProfileService.getProfileById(req.params.id);
    if (!existingProfile) {
      return errorResponse(res, 404, 'Business profile not found');
    }

    if (req.user && Number(existingProfile.user_id) !== Number(req.user.userId)) {
      return errorResponse(res, 403, 'Forbidden: You do not own this business profile');
    }

    const { deletedRemarks } = req.body;
    const profile = await businessProfileService.softDeleteProfile(req.params.id, deletedRemarks, req.user?.userId);
    return successResponse(res, 200, 'Business profile deleted successfully (soft delete)', null);
  } catch (error) {
    next(error);
  }
};

export const approveProfile = async (req, res, next) => {
  try {
    const { updated_by } = req.body;
    const profile = await businessProfileService.approveProfile(req.params.id, updated_by);
    if (!profile) {
      return errorResponse(res, 404, 'Business profile not found');
    }
    return successResponse(res, 200, 'Business profile approved successfully', profile);
  } catch (error) {
    next(error);
  }
};

export const rejectProfile = async (req, res, next) => {
  try {
    const { rejectRemarks, updated_by } = req.body;
    const profile = await businessProfileService.rejectProfile(req.params.id, rejectRemarks, updated_by);
    if (!profile) {
      return errorResponse(res, 404, 'Business profile not found');
    }
    return successResponse(res, 200, 'Business profile rejected successfully', profile);
  } catch (error) {
    next(error);
  }
};

export const featureProfile = async (req, res, next) => {
  try {
    const { updated_by } = req.body;
    const profile = await businessProfileService.featureProfile(req.params.id, updated_by);
    if (!profile) {
      return errorResponse(res, 404, 'Business profile not found');
    }
    return successResponse(res, 200, 'Business profile featured successfully', profile);
  } catch (error) {
    next(error);
  }
};

export const unfeatureProfile = async (req, res, next) => {
  try {
    const { updated_by } = req.body;
    const profile = await businessProfileService.unfeatureProfile(req.params.id, updated_by);
    if (!profile) {
      return errorResponse(res, 404, 'Business profile not found');
    }
    return successResponse(res, 200, 'Business profile unfeatured successfully', profile);
  } catch (error) {
    next(error);
  }
};
