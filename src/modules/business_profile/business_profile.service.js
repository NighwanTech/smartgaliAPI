import BusinessProfile from './business_profile.model.js';
import User from '../user/user.model.js';
import BusinessCategory from '../business_category/business_category.model.js';

export const createProfile = async (profileData) => {
  return await BusinessProfile.create(profileData);
};

export const getAllProfiles = async () => {
  return await BusinessProfile.findAll({
    where: { is_deleted: false },
    include: [
      { model: User, as: 'user', attributes: ['userId', 'userName', 'email'] },
      { model: BusinessCategory, as: 'category', attributes: ['id', 'name', 'icon'] }
    ]
  });
};

export const getProfileById = async (id) => {
  return await BusinessProfile.findOne({
    where: { id, is_deleted: false },
    include: [
      { model: User, as: 'user', attributes: ['userId', 'userName', 'email'] },
      { model: BusinessCategory, as: 'category', attributes: ['id', 'name', 'icon'] }
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
