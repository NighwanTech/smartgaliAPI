import Chat from './chat.model.js';
import User from '../user/user.model.js';
import Community from '../community/community.model.js';
import Event from '../event/event.model.js';
import BusinessProfile from '../business_profile/business_profile.model.js';

export const createChat = async (chatData) => {
  return await Chat.create(chatData);
};

export const getAllChats = async () => {
  return await Chat.findAll({
    where: { is_deleted: false },
    include: [
      { model: User, as: 'creator', attributes: ['userId', 'userName', 'profile_image'] },
      { model: Community, as: 'community', attributes: ['communityId', 'communityName'] },
      { model: Event, as: 'event', attributes: ['id', 'title'] },
      { model: BusinessProfile, as: 'business', attributes: ['id', 'business_name'] }
    ]
  });
};

export const getChatById = async (id) => {
  return await Chat.findOne({
    where: { id, is_deleted: false },
    include: [
      { model: User, as: 'creator', attributes: ['userId', 'userName', 'profile_image'] },
      { model: Community, as: 'community', attributes: ['communityId', 'communityName'] },
      { model: Event, as: 'event', attributes: ['id', 'title'] },
      { model: BusinessProfile, as: 'business', attributes: ['id', 'business_name'] }
    ]
  });
};

export const updateChat = async (id, updateData) => {
  const chat = await Chat.findOne({ where: { id, is_deleted: false } });
  if (!chat) return null;
  return await chat.update({ ...updateData, updatedAt: new Date() });
};

export const softDeleteChat = async (id, deletedRemarks, updated_by) => {
  const chat = await Chat.findOne({ where: { id, is_deleted: false } });
  if (!chat) return null;
  return await chat.update({ is_deleted: true, deletedRemarks, updated_by, updatedAt: new Date() });
};

export const bulkSoftDeleteChats = async (ids, deletedRemarks, updated_by) => {
  return await Chat.update(
    { is_deleted: true, deletedRemarks, updated_by, updatedAt: new Date() },
    { where: { id: ids, is_deleted: false } }
  );
};
