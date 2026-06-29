import { successResponse, errorResponse } from '../../utils/response.js';
import * as communityService from './community.service.js';

export const createCommunity = async (req, res, next) => {
  try {
    const communityData = { ...req.body };

    // Set cover image path if a file was uploaded
    if (req.file) {
      communityData.cover_image = req.file.path.replace(/\\/g, '/');
    }

    const community = await communityService.createCommunity(communityData);
    return successResponse(res, 201, 'Community created successfully', community);
  } catch (error) {
    next(error);
  }
};

export const getAllCommunities = async (req, res, next) => {
  try {
    const communities = await communityService.getAllCommunities();
    return successResponse(res, 200, 'Communities fetched successfully', communities);
  } catch (error) {
    next(error);
  }
};

export const getCommunityById = async (req, res, next) => {
  try {
    const community = await communityService.getCommunityById(req.params.id);
    if (!community) {
      return errorResponse(res, 404, 'Community not found');
    }
    return successResponse(res, 200, 'Community fetched successfully', community);
  } catch (error) {
    next(error);
  }
};

export const updateCommunity = async (req, res, next) => {
  try {
    const updateData = { ...req.body };

    // Set new cover image path if a new file was uploaded
    if (req.file) {
      updateData.cover_image = req.file.path.replace(/\\/g, '/');
    }

    const community = await communityService.updateCommunity(req.params.id, updateData);
    if (!community) {
      return errorResponse(res, 404, 'Community not found');
    }
    return successResponse(res, 200, 'Community updated successfully', community);
  } catch (error) {
    next(error);
  }
};

export const deleteCommunity = async (req, res, next) => {
  try {
    const { deletedRemarks, updated_by } = req.body;
    const community = await communityService.softDeleteCommunity(req.params.id, deletedRemarks, updated_by);
    if (!community) {
      return errorResponse(res, 404, 'Community not found');
    }
    return successResponse(res, 200, 'Community deleted successfully (soft delete)', null);
  } catch (error) {
    next(error);
  }
};
