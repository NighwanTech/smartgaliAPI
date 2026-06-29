import UserProfile from './userProfile.model.js';
import User from '../user/user.model.js';

export const createUserProfile = async (profileData) => {
  return await UserProfile.create(profileData);
};

export const getAllUserProfiles = async () => {
  return await UserProfile.findAll({
    where: { is_deleted: false },
    // include: [{ model: User, as: 'user' }]
  });
};

export const getUserProfileById = async (userProfileId) => {
  return await UserProfile.findOne({
    where: { userProfileId, is_deleted: false },
    //include: [{ model: User, as: 'user' }]
  });
};

export const updateUserProfile = async (userProfileId, updateData) => {
  const profile = await UserProfile.findOne({ where: { userProfileId, is_deleted: false } });
  if (!profile) return null;
  return await profile.update({ ...updateData, updatedAt: new Date() });
};

export const softDeleteUserProfile = async (userProfileId, deletedRemarks, updated_by) => {
  const profile = await UserProfile.findOne({ where: { userProfileId, is_deleted: false } });
  if (!profile) return null;
  return await profile.update({ is_deleted: true, deletedRemarks, updated_by, updatedAt: new Date() });
};
