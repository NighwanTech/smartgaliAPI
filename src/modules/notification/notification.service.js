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
