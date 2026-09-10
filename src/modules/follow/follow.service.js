import Follow from './follow.model.js';
import User from '../user/user.model.js';

export const createFollow = async (followData) => {
  return await Follow.create(followData);
};

export const getAllFollows = async () => {
  return await Follow.findAll({
    where: { is_deleted: false },
    include: [
      { model: User, as: 'follower', attributes: ['userId', 'userName', 'profile_image'] },
      { model: User, as: 'following', attributes: ['userId', 'userName', 'profile_image'] }
    ]
  });
};

export const getFollowById = async (id) => {
  return await Follow.findOne({
    where: { id, is_deleted: false },
    include: [
      { model: User, as: 'follower', attributes: ['userId', 'userName', 'profile_image'] },
      { model: User, as: 'following', attributes: ['userId', 'userName', 'profile_image'] }
    ]
  });
};

export const updateFollow = async (id, updateData) => {
  const follow = await Follow.findOne({ where: { id, is_deleted: false } });
  if (!follow) return null;
  return await follow.update({ ...updateData, updatedAt: new Date() });
};

export const softDeleteFollow = async (id, deletedRemarks, updated_by) => {
  const follow = await Follow.findOne({ where: { id, is_deleted: false } });
  if (!follow) return null;
  return await follow.update({ is_deleted: true, deletedRemarks, updated_by, updatedAt: new Date() });
};

import UserProfile from '../userProfile/userProfile.model.js';

export const followUser = async (followerId, targetUserId) => {
  if (Number(followerId) === Number(targetUserId)) {
    throw new Error('You cannot follow yourself');
  }

  const existing = await Follow.findOne({
    where: { follower_id: followerId, following_id: targetUserId, is_deleted: false }
  });

  if (existing) {
    return existing;
  }

  return await Follow.create({
    follower_id: followerId,
    following_id: targetUserId,
    is_active: true,
    is_deleted: false,
  });
};

export const unfollowUser = async (followerId, targetUserId) => {
  const follow = await Follow.findOne({
    where: { follower_id: followerId, following_id: targetUserId, is_deleted: false }
  });
  if (!follow) return false;

  await follow.update({ is_deleted: true, updatedAt: new Date() });
  return true;
};

export const getFollowers = async (userId) => {
  const follows = await Follow.findAll({
    where: { following_id: userId, is_deleted: false },
    include: [
      {
        model: User,
        as: 'follower',
        attributes: ['userId', 'userName', 'email'],
        include: [{ model: UserProfile, as: 'profile', attributes: ['avatarUrl', 'fullName'] }]
      }
    ]
  });

  return follows.map(f => {
    const user = f.follower;
    if (!user) return null;
    return {
      userId: user.userId,
      userName: user.userName,
      fullName: user.profile?.fullName || user.userName,
      avatarUrl: user.profile?.avatarUrl || null,
      followedAt: f.created_at || f.createdAt,
    };
  }).filter(Boolean);
};

export const getFollowing = async (userId) => {
  const follows = await Follow.findAll({
    where: { follower_id: userId, is_deleted: false },
    include: [
      {
        model: User,
        as: 'following',
        attributes: ['userId', 'userName', 'email'],
        include: [{ model: UserProfile, as: 'profile', attributes: ['avatarUrl', 'fullName'] }]
      }
    ]
  });

  return follows.map(f => {
    const user = f.following;
    if (!user) return null;
    return {
      userId: user.userId,
      userName: user.userName,
      fullName: user.profile?.fullName || user.userName,
      avatarUrl: user.profile?.avatarUrl || null,
      followedAt: f.created_at || f.createdAt,
    };
  }).filter(Boolean);
};

