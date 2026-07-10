import * as settingService from './setting.service.js';
import { successResponse, errorResponse } from '../../utils/response.js';

export const getSettingsByGroup = async (req, res, next) => {
  try {
    const { group } = req.params;
    const settings = await settingService.getSettingsByGroup(group);
    
    // Transform array of key-values to object mapping for easy frontend consumption
    const settingsObject = settings.reduce((acc, curr) => {
      acc[curr.key] = curr.value;
      return acc;
    }, {});
    
    return successResponse(res, 200, `${group} settings fetched successfully`, settingsObject);
  } catch (error) {
    next(error);
  }
};

export const getPublicSettings = async (req, res, next) => {
  try {
    const settings = await settingService.getPublicSettings();
    const settingsObject = settings.reduce((acc, curr) => {
      acc[curr.key] = curr.value;
      return acc;
    }, {});
    
    return successResponse(res, 200, 'Public settings fetched successfully', settingsObject);
  } catch (error) {
    next(error);
  }
};

export const bulkUpdateSettings = async (req, res, next) => {
  try {
    const { group } = req.params;
    const settingsObj = req.body; // Expects a flat object { KEY1: 'val1', KEY2: 'val2' }
    
    const settings = await settingService.bulkUpdateSettings(group, settingsObj);
    
    const settingsObject = settings.reduce((acc, curr) => {
      acc[curr.key] = curr.value;
      return acc;
    }, {});
    
    return successResponse(res, 200, `${group} settings updated successfully`, settingsObject);
  } catch (error) {
    next(error);
  }
};
