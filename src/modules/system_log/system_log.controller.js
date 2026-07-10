import * as logService from './system_log.service.js';
import { successResponse, errorResponse } from '../../utils/response.js';

export const createLog = async (req, res, next) => {
  try {
    const log = await logService.createLog({
      ...req.body,
      ip_address: req.ip
    });
    return successResponse(res, 201, 'Log created successfully', log);
  } catch (error) {
    next(error);
  }
};

export const getActivityLogs = async (req, res, next) => {
  try {
    const logs = await logService.getActivityLogs();
    return successResponse(res, 200, 'Activity logs fetched successfully', logs);
  } catch (error) {
    next(error);
  }
};

export const getErrorLogs = async (req, res, next) => {
  try {
    const logs = await logService.getErrorLogs();
    return successResponse(res, 200, 'Error logs fetched successfully', logs);
  } catch (error) {
    next(error);
  }
};

export const getLogById = async (req, res, next) => {
  try {
    const log = await logService.getLogById(req.params.id);
    if (!log) return errorResponse(res, 404, 'Log not found');
    
    return successResponse(res, 200, 'Log fetched successfully', log);
  } catch (error) {
    next(error);
  }
};
