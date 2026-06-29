import User from './user.model.js';
import Role from '../role/role.model.js';

export const createUser = async (userData) => {
  return await User.create(userData);
};

export const getAllUsers = async () => {
  return await User.findAll({
    where: { is_deleted: false },
    // include: [{ model: Role, as: 'role' }]
  });
};

export const getUserById = async (userId) => {
  return await User.findOne({
    where: { userId, is_deleted: false },
    // include: [{ model: Role, as: 'role' }]
  });
};

export const updateUser = async (userId, updateData) => {
  const user = await User.findOne({ where: { userId, is_deleted: false } });
  if (!user) return null;
  return await user.update({ ...updateData, updatedAt: new Date() });
};

export const softDeleteUser = async (userId, deletedRemarks, updated_by) => {
  const user = await User.findOne({ where: { userId, is_deleted: false } });
  if (!user) return null;
  return await user.update({ is_deleted: true, deletedRemarks, updated_by, updatedAt: new Date() });
};
