import { successResponse, errorResponse } from '../../utils/response.js';
import * as messageService from './message.service.js';

export const createMessage = async (req, res, next) => {
  try {
    const message = await messageService.createMessage(req.body);
    return successResponse(res, 201, 'Message created successfully', message);
  } catch (error) {
    next(error);
  }
};

export const getAllMessages = async (req, res, next) => {
  try {
    const messages = await messageService.getAllMessages();
    return successResponse(res, 200, 'Messages fetched successfully', messages);
  } catch (error) {
    next(error);
  }
};

export const getMessageById = async (req, res, next) => {
  try {
    const message = await messageService.getMessageById(req.params.id);
    if (!message) {
      return errorResponse(res, 404, 'Message not found');
    }
    return successResponse(res, 200, 'Message fetched successfully', message);
  } catch (error) {
    next(error);
  }
};

export const updateMessage = async (req, res, next) => {
  try {
    const message = await messageService.updateMessage(req.params.id, req.body);
    if (!message) {
      return errorResponse(res, 404, 'Message not found');
    }
    return successResponse(res, 200, 'Message updated successfully', message);
  } catch (error) {
    next(error);
  }
};

export const deleteMessage = async (req, res, next) => {
  try {
    const { deletedRemarks, updated_by } = req.body;
    const message = await messageService.softDeleteMessage(req.params.id, deletedRemarks, updated_by);
    if (!message) {
      return errorResponse(res, 404, 'Message not found');
    }
    return successResponse(res, 200, 'Message deleted successfully (soft delete)', null);
  } catch (error) {
    next(error);
  }
};

export const bulkDeleteMessages = async (req, res, next) => {
  try {
    const { ids, deletedRemarks, updated_by } = req.body;
    if (!ids || !Array.isArray(ids) || ids.length === 0) {
      return errorResponse(res, 400, 'Please provide an array of ids');
    }
    const result = await messageService.bulkSoftDeleteMessages(ids, deletedRemarks, updated_by);
    return successResponse(res, 200, 'Messages deleted successfully (bulk soft delete)', result);
  } catch (error) {
    next(error);
  }
};
