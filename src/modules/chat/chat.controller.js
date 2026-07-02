import { successResponse, errorResponse } from '../../utils/response.js';
import * as chatService from './chat.service.js';

export const createChat = async (req, res, next) => {
  try {
    const chat = await chatService.createChat(req.body);
    return successResponse(res, 201, 'Chat created successfully', chat);
  } catch (error) {
    next(error);
  }
};

export const getAllChats = async (req, res, next) => {
  try {
    const chats = await chatService.getAllChats();
    return successResponse(res, 200, 'Chats fetched successfully', chats);
  } catch (error) {
    next(error);
  }
};

export const getChatById = async (req, res, next) => {
  try {
    const chat = await chatService.getChatById(req.params.id);
    if (!chat) {
      return errorResponse(res, 404, 'Chat not found');
    }
    return successResponse(res, 200, 'Chat fetched successfully', chat);
  } catch (error) {
    next(error);
  }
};

export const updateChat = async (req, res, next) => {
  try {
    const chat = await chatService.updateChat(req.params.id, req.body);
    if (!chat) {
      return errorResponse(res, 404, 'Chat not found');
    }
    return successResponse(res, 200, 'Chat updated successfully', chat);
  } catch (error) {
    next(error);
  }
};

export const deleteChat = async (req, res, next) => {
  try {
    const { deletedRemarks, updated_by } = req.body;
    const chat = await chatService.softDeleteChat(req.params.id, deletedRemarks, updated_by);
    if (!chat) {
      return errorResponse(res, 404, 'Chat not found');
    }
    return successResponse(res, 200, 'Chat deleted successfully (soft delete)', null);
  } catch (error) {
    next(error);
  }
};

export const bulkDeleteChats = async (req, res, next) => {
  try {
    const { ids, deletedRemarks, updated_by } = req.body;
    if (!ids || !Array.isArray(ids) || ids.length === 0) {
      return errorResponse(res, 400, 'Please provide an array of ids');
    }
    const result = await chatService.bulkSoftDeleteChats(ids, deletedRemarks, updated_by);
    return successResponse(res, 200, 'Chats deleted successfully (bulk soft delete)', result);
  } catch (error) {
    next(error);
  }
};
