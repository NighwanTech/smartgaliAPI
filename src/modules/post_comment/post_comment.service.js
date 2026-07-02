import PostComment from './post_comment.model.js';
import User from '../user/user.model.js';
import Post from '../post/post.model.js';

export const createComment = async (commentData) => {
  return await PostComment.create(commentData);
};

export const getAllComments = async () => {
  return await PostComment.findAll({
    where: { is_deleted: false },
    include: [
      { model: User, as: 'user', attributes: ['userId', 'userName', 'profile_image'] },
      { model: Post, as: 'post', attributes: ['id', 'content'] }
    ]
  });
};

export const getCommentById = async (id) => {
  return await PostComment.findOne({
    where: { id, is_deleted: false },
    include: [
      { model: User, as: 'user', attributes: ['userId', 'userName', 'profile_image'] },
      { model: Post, as: 'post', attributes: ['id', 'content'] },
      { model: PostComment, as: 'replies' }
    ]
  });
};

export const updateComment = async (id, updateData) => {
  const comment = await PostComment.findOne({ where: { id, is_deleted: false } });
  if (!comment) return null;
  return await comment.update({ ...updateData, updatedAt: new Date() });
};

export const softDeleteComment = async (id, deletedRemarks, updated_by) => {
  const comment = await PostComment.findOne({ where: { id, is_deleted: false } });
  if (!comment) return null;
  return await comment.update({ is_deleted: true, deletedRemarks, updated_by, updatedAt: new Date() });
};

export const bulkSoftDeleteComments = async (ids, deletedRemarks, updated_by) => {
  return await PostComment.update(
    { is_deleted: true, deletedRemarks, updated_by, updatedAt: new Date() },
    { where: { id: ids, is_deleted: false } }
  );
};
