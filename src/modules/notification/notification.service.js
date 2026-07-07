import Notification from './notification.model.js';
import User from '../user/user.model.js';

export const createNotification = async (notificationData) => {
  return await Notification.create(notificationData);
};

export const getAllNotifications = async () => {
  return await Notification.findAll({
    where: { is_deleted: false },
    include: [
      { model: User, as: 'user', attributes: ['userId', 'userName', 'profile_image'] }
    ]
  });
};

export const getNotificationById = async (id) => {
  return await Notification.findOne({
    where: { id, is_deleted: false },
    include: [
      { model: User, as: 'user', attributes: ['userId', 'userName', 'profile_image'] }
    ]
  });
};

export const updateNotification = async (id, updateData) => {
  const notification = await Notification.findOne({ where: { id, is_deleted: false } });
  if (!notification) return null;
  return await notification.update({ ...updateData, updatedAt: new Date() });
};

export const softDeleteNotification = async (id, deletedRemarks, updated_by) => {
  const notification = await Notification.findOne({ where: { id, is_deleted: false } });
  if (!notification) return null;
  return await notification.update({ is_deleted: true, deletedRemarks, updated_by, updatedAt: new Date() });
};

export const bulkSoftDeleteNotifications = async (ids, deletedRemarks, updated_by) => {
  return await Notification.update(
    { is_deleted: true, deletedRemarks, updated_by, updatedAt: new Date() },
    { where: { id: ids, is_deleted: false } }
  );
};

// --- New Features: Broadcast and Email ---

export const sendBroadcastNotification = async (title, message, created_by) => {
  const users = await User.findAll({ where: { is_active: 1, is_deleted: 0 }, attributes: ['userId'] });
  if (!users || users.length === 0) return 0;
  
  const notifications = users.map(user => ({
    user_id: user.userId,
    title,
    message,
    type: 'alert',
    is_read: false,
    created_by: created_by || 1
  }));
  
  await Notification.bulkCreate(notifications);
  return users.length;
};

// Import EmailNotification model here to avoid circular dependency early load issues
import EmailNotification from './email_notification.model.js';

export const createEmailNotification = async (emailData) => {
  return await EmailNotification.create(emailData);
};

export const getAllEmailNotifications = async () => {
  return await EmailNotification.findAll({
    where: { is_deleted: false },
    include: [
      { model: User, as: 'user', attributes: ['userId', 'userName', 'email', 'profile_image'] }
    ]
  });
};
