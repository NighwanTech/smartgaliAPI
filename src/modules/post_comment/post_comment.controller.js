import { successResponse, errorResponse } from '../../utils/response.js';
import * as postCommentService from './post_comment.service.js';

export const createComment = async (req, res, next) => {
  try {
    const comment = await postCommentService.createComment(req.body);
    return successResponse(res, 201, 'Post comment created successfully', comment);
  } catch (error) {
    next(error);
  }
};

export const getAllComments = async (req, res, next) => {
  try {
    const comments = await postCommentService.getAllComments();
    return successResponse(res, 200, 'Post comments fetched successfully', comments);
  } catch (error) {
    next(error);
  }
};

export const getCommentById = async (req, res, next) => {
  try {
    const comment = await postCommentService.getCommentById(req.params.id);
    if (!comment) {
      return errorResponse(res, 404, 'Post comment not found');
    }
    return successResponse(res, 200, 'Post comment fetched successfully', comment);
  } catch (error) {
    next(error);
  }
};

export const updateComment = async (req, res, next) => {
  try {
    const comment = await postCommentService.updateComment(req.params.id, req.body);
    if (!comment) {
      return errorResponse(res, 404, 'Post comment not found');
    }
    return successResponse(res, 200, 'Post comment updated successfully', comment);
  } catch (error) {
    next(error);
  }
};

export const deleteComment = async (req, res, next) => {
  try {
    const { deletedRemarks, updated_by } = req.body;
    const comment = await postCommentService.softDeleteComment(req.params.id, deletedRemarks, updated_by);
    if (!comment) {
      return errorResponse(res, 404, 'Post comment not found');
    }
    return successResponse(res, 200, 'Post comment deleted successfully (soft delete)', null);
  } catch (error) {
    next(error);
  }
};

export const bulkDeleteComments = async (req, res, next) => {
  try {
    const { ids, deletedRemarks, updated_by } = req.body;
    if (!ids || !Array.isArray(ids) || ids.length === 0) {
      return errorResponse(res, 400, 'Please provide an array of ids');
    }
    const result = await postCommentService.bulkSoftDeleteComments(ids, deletedRemarks, updated_by);
    return successResponse(res, 200, 'Post comments deleted successfully (bulk soft delete)', result);
  } catch (error) {
    next(error);
  }
};
