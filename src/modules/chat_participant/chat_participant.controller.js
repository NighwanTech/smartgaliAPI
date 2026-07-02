import { successResponse, errorResponse } from '../../utils/response.js';
import * as chatParticipantService from './chat_participant.service.js';

export const createParticipant = async (req, res, next) => {
  try {
    const participant = await chatParticipantService.createParticipant(req.body);
    return successResponse(res, 201, 'Chat participant created successfully', participant);
  } catch (error) {
    next(error);
  }
};

export const getAllParticipants = async (req, res, next) => {
  try {
    const participants = await chatParticipantService.getAllParticipants();
    return successResponse(res, 200, 'Chat participants fetched successfully', participants);
  } catch (error) {
    next(error);
  }
};

export const getParticipantById = async (req, res, next) => {
  try {
    const participant = await chatParticipantService.getParticipantById(req.params.id);
    if (!participant) {
      return errorResponse(res, 404, 'Chat participant not found');
    }
    return successResponse(res, 200, 'Chat participant fetched successfully', participant);
  } catch (error) {
    next(error);
  }
};

export const updateParticipant = async (req, res, next) => {
  try {
    const participant = await chatParticipantService.updateParticipant(req.params.id, req.body);
    if (!participant) {
      return errorResponse(res, 404, 'Chat participant not found');
    }
    return successResponse(res, 200, 'Chat participant updated successfully', participant);
  } catch (error) {
    next(error);
  }
};

export const deleteParticipant = async (req, res, next) => {
  try {
    const { deletedRemarks, updated_by } = req.body;
    const participant = await chatParticipantService.softDeleteParticipant(req.params.id, deletedRemarks, updated_by);
    if (!participant) {
      return errorResponse(res, 404, 'Chat participant not found');
    }
    return successResponse(res, 200, 'Chat participant deleted successfully (soft delete)', null);
  } catch (error) {
    next(error);
  }
};

export const bulkDeleteParticipants = async (req, res, next) => {
  try {
    const { ids, deletedRemarks, updated_by } = req.body;
    if (!ids || !Array.isArray(ids) || ids.length === 0) {
      return errorResponse(res, 400, 'Please provide an array of ids');
    }
    const result = await chatParticipantService.bulkSoftDeleteParticipants(ids, deletedRemarks, updated_by);
    return successResponse(res, 200, 'Chat participants deleted successfully (bulk soft delete)', result);
  } catch (error) {
    next(error);
  }
};
