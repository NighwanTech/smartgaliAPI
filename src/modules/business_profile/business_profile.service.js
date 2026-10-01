import BusinessProfile from './business_profile.model.js';
import User from '../user/user.model.js';
import BusinessCategory from '../business_category/business_category.model.js';
import BusinessOffer from '../business_offer/business_offer.model.js';
import BusinessReview from '../business_review/business_review.model.js';

export const createProfile = async (profileData) => {
  return await BusinessProfile.create(profileData);
};

export const getAllProfiles = async (query = {}) => {
  const whereClause = { is_deleted: false };
  
  if (query.is_verified !== undefined && query.is_verified !== null) {
    whereClause.is_verified = query.is_verified === 'true' || query.is_verified === true;
  }
  
  if (query.is_featured !== undefined && query.is_featured !== null) {
    whereClause.is_featured = query.is_featured === 'true' || query.is_featured === true;
  }

  return await BusinessProfile.findAll({
    where: whereClause,
    include: [
      { model: User, as: 'user', attributes: ['userId', 'userName', 'email'] }
    ]
  });
};

export const getProfileById = async (id) => {
  return await BusinessProfile.findOne({
    where: { id, is_deleted: false },
    include: [
      { model: User, as: 'user', attributes: ['userId', 'userName', 'email'] }
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
  return await profile.update({ is_verified: false, is_deleted: true, deletedRemarks: rejectRemarks, updated_by, updatedAt: new Date() });
};

export const featureProfile = async (id, updated_by) => {
  const profile = await BusinessProfile.findOne({ where: { id, is_deleted: false } });
  if (!profile) return null;
  return await profile.update({ is_featured: true, updated_by, updatedAt: new Date() });
};

export const unfeatureProfile = async (id, updated_by) => {
  const profile = await BusinessProfile.findOne({ where: { id, is_deleted: false } });
  if (!profile) return null;
  return await profile.update({ is_featured: false, updated_by, updatedAt: new Date() });
};

export const getProfileByUserId = async (userId) => {
  return await BusinessProfile.findOne({
    where: { userId, is_deleted: false },
    include: [
      { model: User, as: 'user', attributes: ['userId', 'userName', 'email'] }
    ]
  });
};

export const getDashboardStats = async (userId) => {
  const profile = await BusinessProfile.findOne({ where: { userId, is_deleted: false } });
  if (!profile) {
    return { activeOffers: 0, activeOffersCount: 0, totalReviews: 0, averageRating: 0, views7d: 0, newLeads: 0 };
  }
  const offersCount = await BusinessOffer.count({ where: { business_id: profile.id, is_deleted: false } });
  
  // Calculate total reviews and average rating
  const reviews = await BusinessReview.findAll({ 
    where: { business_id: profile.id, is_deleted: false },
    attributes: [[sequelize.fn('AVG', sequelize.col('rating')), 'averageRating'], [sequelize.fn('COUNT', sequelize.col('id')), 'totalReviews']],
    raw: true
  });
  
  const totalReviews = reviews[0]?.totalReviews ? parseInt(reviews[0].totalReviews, 10) : 0;
  const averageRating = reviews[0]?.averageRating ? parseFloat(reviews[0].averageRating).toFixed(1) : 0;

  return {
    activeOffers: offersCount,
    activeOffersCount: offersCount,
    totalReviews: totalReviews,
    averageRating: Number(averageRating),
    views7d: profile.views_7d || 0, // Fallbacks for frontend
    newLeads: profile.new_leads || 0,
    businessId: profile.id,
  };
};
