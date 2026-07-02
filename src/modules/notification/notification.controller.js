import { successResponse, errorResponse } from '../../utils/response.js';
import * as notificationService from './notification.service.js';

export const createNotification = async (req, res, next) => {
  try {
    const notification = await notificationService.createNotification(req.body);
    return successResponse(res, 201, 'Notification created successfully', notification);
  } catch (error) {
    next(error);
  }
};

export const getAllNotifications = async (req, res, next) => {
  try {
    const notifications = await notificationService.getAllNotifications();
    return successResponse(res, 200, 'Notifications fetched successfully', notifications);
  } catch (error) {
    next(error);
  }
};

export const getNotificationById = async (req, res, next) => {
  try {
    const notification = await notificationService.getNotificationById(req.params.id);
    if (!notification) {
      return errorResponse(res, 404, 'Notification not found');
    }
    return successResponse(res, 200, 'Notification fetched successfully', notification);
  } catch (error) {
    next(error);
  }
};

export const updateNotification = async (req, res, next) => {
  try {
    const notification = await notificationService.updateNotification(req.params.id, req.body);
    if (!notification) {
      return errorResponse(res, 404, 'Notification not found');
    }
    return successResponse(res, 200, 'Notification updated successfully', notification);
  } catch (error) {
    next(error);
  }
};

export const deleteNotification = async (req, res, next) => {
  try {
    const { deletedRemarks, updated_by } = req.body;
    const notification = await notificationService.softDeleteNotification(req.params.id, deletedRemarks, updated_by);
    if (!notification) {
      return errorResponse(res, 404, 'Notification not found');
    }
    return successResponse(res, 200, 'Notification deleted successfully (soft delete)', null);
  } catch (error) {
    next(error);
  }
};

export const bulkDeleteNotifications = async (req, res, next) => {
  try {
    const { ids, deletedRemarks, updated_by } = req.body;
    if (!ids || !Array.isArray(ids) || ids.length === 0) {
      return errorResponse(res, 400, 'Please provide an array of ids');
    }
    const result = await notificationService.bulkSoftDeleteNotifications(ids, deletedRemarks, updated_by);
    return successResponse(res, 200, 'Notifications deleted successfully (bulk soft delete)', result);
  } catch (error) {
    next(error);
  }
};
