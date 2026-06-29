import { successResponse, errorResponse } from '../../utils/response.js';
import * as userProfileService from './userProfile.service.js';

export const createUserProfile = async (req, res, next) => {
  try {
    const profile = await userProfileService.createUserProfile(req.body);
    return successResponse(res, 201, 'User profile created successfully', profile);
  } catch (error) {
    if (error.name === 'SequelizeUniqueConstraintError') {
      return errorResponse(res, 400, 'Profile already exists');
    }
    next(error);
  }
};

export const getAllUserProfiles = async (req, res, next) => {
  try {
    const profiles = await userProfileService.getAllUserProfiles();
    return successResponse(res, 200, 'User profiles fetched successfully', profiles);
  } catch (error) {
    next(error);
  }
};

export const getUserProfileById = async (req, res, next) => {
  try {
    const profile = await userProfileService.getUserProfileById(req.params.id);
    if (!profile) {
      return errorResponse(res, 404, 'User profile not found');
    }
    return successResponse(res, 200, 'User profile fetched successfully', profile);
  } catch (error) {
    next(error);
  }
};

export const updateUserProfile = async (req, res, next) => {
  try {
    const profile = await userProfileService.updateUserProfile(req.params.id, req.body);
    if (!profile) {
      return errorResponse(res, 404, 'User profile not found');
    }
    return successResponse(res, 200, 'User profile updated successfully', profile);
  } catch (error) {
    next(error);
  }
};

export const deleteUserProfile = async (req, res, next) => {
  try {
    const { deletedRemarks, updated_by } = req.body;
    const profile = await userProfileService.softDeleteUserProfile(req.params.id, deletedRemarks, updated_by);
    if (!profile) {
      return errorResponse(res, 404, 'User profile not found');
    }
    return successResponse(res, 200, 'User profile deleted successfully (soft delete)', null);
  } catch (error) {
    next(error);
  }
};
