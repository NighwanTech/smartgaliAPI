import { successResponse, errorResponse } from '../../utils/response.js';
import * as businessProfileService from './business_profile.service.js';

export const createProfile = async (req, res, next) => {
  try {
    const profile = await businessProfileService.createProfile(req.body);
    return successResponse(res, 201, 'Business profile created successfully', profile);
  } catch (error) {
    next(error);
  }
};

export const getAllProfiles = async (req, res, next) => {
  try {
    const profiles = await businessProfileService.getAllProfiles();
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

export const updateProfile = async (req, res, next) => {
  try {
    const profile = await businessProfileService.updateProfile(req.params.id, req.body);
    if (!profile) {
      return errorResponse(res, 404, 'Business profile not found');
    }
    return successResponse(res, 200, 'Business profile updated successfully', profile);
  } catch (error) {
    next(error);
  }
};

export const deleteProfile = async (req, res, next) => {
  try {
    const { deletedRemarks, updated_by } = req.body;
    const profile = await businessProfileService.softDeleteProfile(req.params.id, deletedRemarks, updated_by);
    if (!profile) {
      return errorResponse(res, 404, 'Business profile not found');
    }
    return successResponse(res, 200, 'Business profile deleted successfully (soft delete)', null);
  } catch (error) {
    next(error);
  }
};
