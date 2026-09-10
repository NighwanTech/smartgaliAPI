import { successResponse, errorResponse } from '../../utils/response.js';
import * as businessReviewService from './business_review.service.js';

export const createReview = async (req, res, next) => {
  try {
    const userId = req.user?.userId || req.body.user_id || req.body.userId;
    const reviewData = {
      ...req.body,
      user_id: userId,
      created_by: userId
    };
    const review = await businessReviewService.createReview(reviewData);
    return successResponse(res, 201, 'Business review added successfully', review);
  } catch (error) {
    next(error);
  }
};

export const getAllReviews = async (req, res, next) => {
  try {
    const reviews = await businessReviewService.getAllReviews();
    return successResponse(res, 200, 'Business reviews fetched successfully', reviews);
  } catch (error) {
    next(error);
  }
};

export const getReviewById = async (req, res, next) => {
  try {
    const review = await businessReviewService.getReviewById(req.params.id);
    if (!review) {
      return errorResponse(res, 404, 'Business review not found');
    }
    return successResponse(res, 200, 'Business review fetched successfully', review);
  } catch (error) {
    next(error);
  }
};

export const getReviewsByBusinessId = async (req, res, next) => {
  try {
    const reviews = await businessReviewService.getReviewsByBusinessId(req.params.businessId);
    return successResponse(res, 200, 'Business reviews fetched successfully', reviews);
  } catch (error) {
    next(error);
  }
};

export const updateReview = async (req, res, next) => {
  try {
    const review = await businessReviewService.updateReview(req.params.id, req.body);
    if (!review) {
      return errorResponse(res, 404, 'Business review not found');
    }
    return successResponse(res, 200, 'Business review updated successfully', review);
  } catch (error) {
    next(error);
  }
};

export const deleteReview = async (req, res, next) => {
  try {
    const { deletedRemarks, updated_by } = req.body;
    const review = await businessReviewService.softDeleteReview(req.params.id, deletedRemarks, updated_by);
    if (!review) {
      return errorResponse(res, 404, 'Business review not found');
    }
    return successResponse(res, 200, 'Business review deleted successfully (soft delete)', null);
  } catch (error) {
    next(error);
  }
};

export const replyToReview = async (req, res, next) => {
  try {
    const { reply } = req.body;
    if (!reply || !reply.trim()) {
      return errorResponse(res, 400, 'Reply text is required');
    }

    const review = await businessReviewService.getReviewById(req.params.id);
    if (!review) {
      return errorResponse(res, 404, 'Business review not found');
    }

    // Verify authenticated user is the business owner
    if (Number(review.business?.user_id) !== Number(req.user.userId)) {
      return errorResponse(res, 403, 'Only the business owner can reply to this review');
    }

    const updated = await businessReviewService.updateReview(req.params.id, {
      remark: reply.trim(),
      updated_by: req.user.userId,
    });

    return successResponse(res, 200, 'Response posted successfully', updated);
  } catch (error) {
    next(error);
  }
};
