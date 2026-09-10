import Message from './message.model.js';
import User from '../user/user.model.js';
import Chat from '../chat/chat.model.js';

export const createMessage = async (messageData) => {
  return await Message.create(messageData);
};

export const getAllMessages = async () => {
  return await Message.findAll({
    where: { is_deleted: false },
    include: [
      { model: User, as: 'sender', attributes: ['userId', 'userName', 'profile_image'] },
      { model: Chat, as: 'chat', attributes: ['id', 'chat_type'] },
      { model: Message, as: 'repliedMessage', attributes: ['id', 'message'] }
    ]
  });
};

export const getMessageById = async (id) => {
  return await Message.findOne({
    where: { id, is_deleted: false },
    include: [
      { model: User, as: 'sender', attributes: ['userId', 'userName', 'profile_image'] },
      { model: Chat, as: 'chat', attributes: ['id', 'chat_type'] },
      { model: Message, as: 'repliedMessage', attributes: ['id', 'message'] }
    ]
  });
};

export const updateMessage = async (id, updateData) => {
  const message = await Message.findOne({ where: { id, is_deleted: false } });
  if (!message) return null;
  return await message.update({ ...updateData, updatedAt: new Date() });
};

export const softDeleteMessage = async (id, deletedRemarks, updated_by) => {
  const message = await Message.findOne({ where: { id, is_deleted: false } });
  if (!message) return null;
  return await message.update({ is_deleted: true, deletedRemarks, updated_by, updatedAt: new Date() });
};

export const getMessagesByChatId = async (chatId) => {
  return await Message.findAll({
    where: { chat_id: chatId, is_deleted: false },
    order: [['created_at', 'ASC']],
    include: [
      { model: User, as: 'sender', attributes: ['userId', 'userName'] },
      { model: Chat, as: 'chat', attributes: ['id', 'chat_type'] }
    ]
  });
};

export const bulkSoftDeleteMessages = async (ids, deletedRemarks, updated_by) => {
  return await Message.update(
    { is_deleted: true, deletedRemarks, updated_by, updatedAt: new Date() },
    { where: { id: ids, is_deleted: false } }
  );
};
