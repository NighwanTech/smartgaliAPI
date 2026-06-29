import Community from './community.model.js';
import CommunityCategory from '../communityCategory/communityCategory.model.js';
import User from '../user/user.model.js';

export const createCommunity = async (communityData) => {
  return await Community.create(communityData);
};

export const getAllCommunities = async () => {
  return await Community.findAll({
    where: { is_deleted: false },
    include: [
      { model: CommunityCategory, as: 'category' },
      { model: User, as: 'creator' }
    ]
  });
};

export const getCommunityById = async (communityId) => {
  return await Community.findOne({
    where: { communityId, is_deleted: false },
    include: [
      { model: CommunityCategory, as: 'category' },
      { model: User, as: 'creator' }
    ]
  });
};

export const updateCommunity = async (communityId, updateData) => {
  const community = await Community.findOne({ where: { communityId, is_deleted: false } });
  if (!community) return null;
  return await community.update({ ...updateData, updatedAt: new Date() });
};

export const softDeleteCommunity = async (communityId, deletedRemarks, updated_by) => {
  const community = await Community.findOne({ where: { communityId, is_deleted: false } });
  if (!community) return null;
  return await community.update({ is_deleted: true, deletedRemarks, updated_by, updatedAt: new Date() });
};
