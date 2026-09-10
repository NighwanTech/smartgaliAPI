import BusinessProfile from './business_profile.model.js';
import User from '../user/user.model.js';
import BusinessCategory from '../business_category/business_category.model.js';

export const createProfile = async (profileData) => {
  return await BusinessProfile.create(profileData);
};

export const getAllProfiles = async (query = {}) => {
  const whereClause = { is_deleted: false };
  return await BusinessProfile.findAll({
    where: whereClause,
    include: [
      { model: User, as: 'user', attributes: ['userId', 'userName', 'email', 'phone'] }
    ]
  });
};

export const getProfileById = async (id) => {
  return await BusinessProfile.findOne({
    where: { id, is_deleted: false },
    include: [
      { model: User, as: 'user', attributes: ['userId', 'userName', 'email', 'phone'] }
    ]
  });
};

export const getProfileByUserId = async (userId) => {
  return await BusinessProfile.findOne({
    where: { user_id: userId, is_deleted: false },
    include: [
      { model: User, as: 'user', attributes: ['userId', 'userName', 'email', 'phone'] }
    ]
  });
};

export const updateProfile = async (id, updateData) => {
  const profile = await BusinessProfile.findOne({ where: { id, is_deleted: false } });
  if (!profile) return null;
  return await profile.update({ ...updateData, updatedAt: new Date() });
};

export const softDeleteProfile = async (id, deletedRemarks, updated_by) => {
  const profile = await BusinessProfile.findOne({ where: { id, is_deleted: false } });
  if (!profile) return null;
  return await profile.update({ is_deleted: true, deletedRemarks, updated_by, updatedAt: new Date() });
};

export const approveProfile = async (id, updated_by) => {
  const profile = await BusinessProfile.findOne({ where: { id, is_deleted: false } });
  if (!profile) return null;
  return await profile.update({ is_verified: true, updated_by, updatedAt: new Date() });
};

export const rejectProfile = async (id, rejectRemarks, updated_by) => {
  const profile = await BusinessProfile.findOne({ where: { id, is_deleted: false } });
  if (!profile) return null;
  // We can either set it as deleted or keep it but mark it rejected. 
  // Let's mark it as soft deleted with rejection remarks.
  return await profile.update({ is_verified: false, is_deleted: true, deletedRemarks: rejectRemarks, updated_by, updatedAt: new Date() });
};

export const featureProfile = async (id, updated_by) => {
  const profile = await BusinessProfile.findOne({ where: { id, is_deleted: false } });
  if (!profile) return null;
  return await profile.update({ is_featured: true, updated_by, updatedAt: new Date() });
};

import BusinessOffer from '../business_offer/business_offer.model.js';
import BusinessReview from '../business_review/business_review.model.js';

export const getReviewStats = async (businessId) => {
  const reviews = await BusinessReview.findAll({
    where: { business_id: businessId, is_deleted: false },
    attributes: ['rating']
  });

  const totalReviews = reviews.length;
  let averageRating = null;
  if (totalReviews > 0) {
    const sum = reviews.reduce((acc, r) => acc + (Number(r.rating) || 0), 0);
    averageRating = Number((sum / totalReviews).toFixed(1));
  }

  return {
    rating: averageRating,
    reviewCount: totalReviews > 0 ? totalReviews : null
  };
};

export const getDashboardStats = async (userId) => {
  const profile = await BusinessProfile.findOne({
    where: { user_id: userId, is_deleted: false }
  });
  if (!profile) return null;

  const activeOffersCount = await BusinessOffer.count({
    where: { business_id: profile.id, is_deleted: false }
  });

  const { rating, reviewCount } = await getReviewStats(profile.id);

  return {
    businessId: Number(profile.id),
    businessName: profile.business_name,
    activeOffersCount,
    totalReviews: reviewCount || 0,
    averageRating: rating !== null ? rating : 0.0,
    isVerified: Boolean(profile.is_verified)
  };
};

