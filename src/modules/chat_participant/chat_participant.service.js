import ChatParticipant from './chat_participant.model.js';
import User from '../user/user.model.js';
import Chat from '../chat/chat.model.js';

export const createParticipant = async (participantData) => {
  return await ChatParticipant.create(participantData);
};

export const getAllParticipants = async () => {
  return await ChatParticipant.findAll({
    where: { is_deleted: false },
    include: [
      { model: User, as: 'user', attributes: ['userId', 'userName', 'profile_image'] },
      { model: Chat, as: 'chat', attributes: ['id', 'chat_type'] }
    ]
  });
};

export const getParticipantById = async (id) => {
  return await ChatParticipant.findOne({
    where: { id, is_deleted: false },
    include: [
      { model: User, as: 'user', attributes: ['userId', 'userName', 'profile_image'] },
      { model: Chat, as: 'chat', attributes: ['id', 'chat_type'] }
    ]
  });
};

export const updateParticipant = async (id, updateData) => {
  const participant = await ChatParticipant.findOne({ where: { id, is_deleted: false } });
  if (!participant) return null;
  return await participant.update({ ...updateData, updatedAt: new Date() });
};

export const softDeleteParticipant = async (id, deletedRemarks, updated_by) => {
  const participant = await ChatParticipant.findOne({ where: { id, is_deleted: false } });
  if (!participant) return null;
  return await participant.update({ is_deleted: true, deletedRemarks, updated_by, updatedAt: new Date() });
};

export const bulkSoftDeleteParticipants = async (ids, deletedRemarks, updated_by) => {
  return await ChatParticipant.update(
    { is_deleted: true, deletedRemarks, updated_by, updatedAt: new Date() },
    { where: { id: ids, is_deleted: false } }
  );
};
