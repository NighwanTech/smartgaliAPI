import * as feedbackService from './feedback.service.js';
import { successResponse, errorResponse } from '../../utils/response.js';

export const createFeedback = async (req, res, next) => {
  try {
    const feedback = await feedbackService.createFeedback(req.body);
    return successResponse(res, 201, 'Feedback submitted successfully', feedback);
  } catch (error) {
    next(error);
  }
};

export const getAllFeedback = async (req, res, next) => {
  try {
    const feedbacks = await feedbackService.getAllFeedback();
    return successResponse(res, 200, 'Feedback fetched successfully', feedbacks);
  } catch (error) {
    next(error);
  }
};

export const getFeedbackById = async (req, res, next) => {
  try {
    const feedback = await feedbackService.getFeedbackById(req.params.id);
    if (!feedback) return errorResponse(res, 404, 'Feedback not found');
    
    return successResponse(res, 200, 'Feedback fetched successfully', feedback);
  } catch (error) {
    next(error);
  }
};

export const updateFeedback = async (req, res, next) => {
  try {
    const feedback = await feedbackService.updateFeedback(req.params.id, req.body);
    if (!feedback) return errorResponse(res, 404, 'Feedback not found');
    
    return successResponse(res, 200, 'Feedback updated successfully', feedback);
  } catch (error) {
    next(error);
  }
};

export const deleteFeedback = async (req, res, next) => {
  try {
    const success = await feedbackService.deleteFeedback(req.params.id);
    if (!success) return errorResponse(res, 404, 'Feedback not found');
    
    return successResponse(res, 200, 'Feedback deleted successfully');
  } catch (error) {
    next(error);
  }
};
