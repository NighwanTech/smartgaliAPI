/**
 * PostComment Service - Scalability Hardening Phase 13 (Real-Time Nested Replies & Enterprise Integrity)
 * ───────────────────────────────────────────────────────────────────────────────────────────────────────
 * COMMENT creation & deletion are fully transactional:
 *
 *   BEGIN -> verify post -> verify comments enabled -> verify parentComment (if reply)
 *         -> create PostComment -> increment comments_count -> create POST_COMMENTED outbox event -> COMMIT
 *         -> real-time WebSocket emit to post & author rooms
 *
 * Comments fetch uses keyset cursor pagination with eager-loaded threaded replies.
 * Full CRUD operations with counter synchronization & soft-delete capabilities.
 */

import { Op } from 'sequelize';
import sequelize from '../../config/db.js';
import PostComment from './post_comment.model.js';
import Post from '../post/post.model.js';
import User from '../user/user.model.js';
import UserProfile from '../userProfile/userProfile.model.js';
import { createEvent } from '../outbox/outbox.service.js';
import { OUTBOX_EVENT_TYPES, OUTBOX_AGGREGATE_TYPES } from '../outbox/outbox.events.js';
import {
  emitNotification,
  resolveDisplayName,
} from '../notification/notification.service.js';
import { logger } from '../../utils/logger.js';
import {
  postCommentsTotal,
  postCommentsFailedTotal,
} from '../../monitoring/metrics.js';
import { getIO } from '../../socket.js';
import { toNormalizedIsoString } from '../../utils/date.util.js';

const MAX_COMMENT_LENGTH = 2000;
const COMMENT_PREVIEW_LENGTH = 80;
const SAFE_USER_ATTRS = ['userId', 'userName'];
const SAFE_PROFILE_ATTRS = ['fullName', 'avatarUrl'];

export class CommentError extends Error {
  constructor(message, statusCode = 400) {
    super(message);
    this.name = 'CommentError';
    this.statusCode = statusCode;
  }
}

/** Mutable deps for tests */
export const commentDeps = {
  emitNotification: (opts) => emitNotification(opts),
  resolveDisplayName: (id) => resolveDisplayName(id),
  createNotification: async () => null,
  sendToUser: async () => ({ sent: 1 }),
};

const commentPreview = (text) => {
  if (!text) return '';
  return text.length > COMMENT_PREVIEW_LENGTH
    ? `${text.slice(0, COMMENT_PREVIEW_LENGTH - 3)}...`
    : text;
};

/**
 * Add a comment or threaded reply - fully transactional.
 * PostComment + comments_count increment + outbox event in ONE transaction.
 */
export const addComment = async (userId, postId, content, correlationId, parentId = null) => {
  if (!content || !content.trim()) {
    postCommentsFailedTotal.inc({ reason: 'empty_content' });
    throw new CommentError('Comment content cannot be empty.', 400);
  }
  if (content.length > MAX_COMMENT_LENGTH) {
    postCommentsFailedTotal.inc({ reason: 'content_too_long' });
    throw new CommentError(`Comment cannot exceed ${MAX_COMMENT_LENGTH} characters.`, 400);
  }

  let comment;
  let parentComment = null;
  let effectiveParentId = null;
  const parsedParentId = parentId ? Number(parentId) : null;

  const transaction = await sequelize.transaction();
  try {
    // 1. Verify post exists
    const post = await Post.findOne({
      where: { id: postId, is_deleted: false },
      attributes: ['id', 'user_id', 'comments_disabled'],
      transaction,
    });
    if (!post) {
      await transaction.rollback();
      postCommentsFailedTotal.inc({ reason: 'post_not_found' });
      throw new CommentError('Post not found.', 404);
    }

    // 2. Verify comments are enabled
    if (Boolean(post.comments_disabled)) {
      await transaction.rollback();
      postCommentsFailedTotal.inc({ reason: 'comments_disabled' });
      throw new CommentError('Comments are disabled for this post.', 403);
    }

    // 3. Verify parent comment if this is a reply
    if (parsedParentId && parsedParentId > 0) {
      parentComment = await PostComment.findOne({
        where: { id: parsedParentId, post_id: postId, is_deleted: false },
        attributes: ['id', 'user_id', 'parent_id', 'post_id'],
        transaction,
      });
      if (!parentComment) {
        await transaction.rollback();
        postCommentsFailedTotal.inc({ reason: 'parent_comment_not_found' });
        throw new CommentError('Parent comment not found.', 404);
      }
      // If the target comment is already a nested reply, link to root parent to maintain 1-level clean thread
      effectiveParentId = parentComment.parent_id ? Number(parentComment.parent_id) : Number(parentComment.id);
    }

    // 4. Create comment
    comment = await PostComment.create({
      post_id: postId,
      user_id: userId,
      parent_id: effectiveParentId,
      content: content.trim(),
      is_active: true,
      is_deleted: false,
      created_by: userId,
    }, { transaction });

    // 5. Atomically increment comments_count
    await Post.increment('comments_count', {
      by: 1,
      where: { id: postId },
      transaction,
    });

    // 6. Write POST_COMMENTED outbox event (same transaction)
    await createEvent({
      event_type: OUTBOX_EVENT_TYPES.POST_COMMENTED,
      aggregate_type: OUTBOX_AGGREGATE_TYPES.POST,
      aggregate_id: String(comment.id),
      payload: {
        postId: Number(postId),
        commentId: Number(comment.id),
        parentId: effectiveParentId,
        userId: Number(userId),
        correlationId,
      },
    }, { transaction });

    await transaction.commit();

    postCommentsTotal.inc();
    logger.info('POST_COMMENT', 'comment_added', {
      correlationId,
      postId: Number(postId),
      commentId: Number(comment.id),
      parentId: effectiveParentId,
    });

    // Non-blocking notification (after commit - never inside transaction)
    const postAuthorId = Number(post.user_id);
    commentDeps.resolveDisplayName(userId)
      .then(async (name) => {
        // If reply, notify original comment author
        if (parentComment && Number(parentComment.user_id) !== Number(userId)) {
          await commentDeps.emitNotification({
            recipientId: Number(parentComment.user_id),
            actorId: userId,
            type: 'info',
            title: `${name} replied to your comment`,
            message: commentPreview(comment.content) || 'New reply on your comment.',
            data: {
              target: 'post',
              postId: Number(postId),
              commentId: Number(comment.id),
              parentId: effectiveParentId,
              event: 'POST_REPLY',
            },
            preferenceKey: null,
            sendPush: true,
          }).catch((e) => logger.error('POST_REPLY', 'notification_failed', { correlationId, error: e.message }));
        }

        // Notify post author if not self and not already notified as parent author
        if (postAuthorId !== Number(userId) && (!parentComment || Number(parentComment.user_id) !== postAuthorId)) {
          await commentDeps.emitNotification({
            recipientId: postAuthorId,
            actorId: userId,
            type: 'info',
            title: effectiveParentId ? `${name} replied on your post` : `${name} commented on your post`,
            message: commentPreview(comment.content) || 'New comment on your post.',
            data: {
              target: 'post',
              postId: Number(postId),
              commentId: Number(comment.id),
              parentId: effectiveParentId,
              event: effectiveParentId ? 'POST_REPLY' : 'POST_COMMENT',
            },
            preferenceKey: null,
            sendPush: true,
          }).catch((e) => logger.error('POST_COMMENT', 'notification_failed', { correlationId, error: e.message }));
        }
      })
      .catch((e) => logger.error('POST_COMMENT', 'name_resolution_failed', { correlationId, error: e.message }));
  } catch (err) {
    if (transaction && !transaction.finished) await transaction.rollback().catch(() => {});
    throw err;
  }

  // Fetch author info to send formatted payload
  let authorUser = null;
  try {
    authorUser = await User.findOne({
      where: { userId },
      attributes: SAFE_USER_ATTRS,
      include: [{ model: UserProfile, as: 'profile', attributes: SAFE_PROFILE_ATTRS, required: false }],
    });
  } catch (_) {}

  const authorName = authorUser?.profile?.fullName || authorUser?.userName || 'User';
  const authorAvatar = authorUser?.profile?.avatarUrl || null;

  const formattedComment = {
    id: Number(comment.id),
    commentId: Number(comment.id),
    postId: Number(postId),
    parentId: effectiveParentId,
    content: comment.content,
    createdAt: toNormalizedIsoString(comment.created_at || new Date()),
    author: {
      userId: Number(userId),
      userName: authorUser?.userName || null,
      fullName: authorName,
      avatarUrl: authorAvatar,
    },
    authorName,
    replies: [],
  };

  // Real-time Socket.IO emission to post and author rooms
  try {
    const io = getIO();
    if (io) {
      io.to(`post:${postId}`).emit('post:comment', formattedComment);
      io.to(`post_${postId}`).emit('post:comment', formattedComment);
      io.to(`user:${userId}`).emit('post:comment', formattedComment);
      if (parentComment && Number(parentComment.user_id) !== Number(userId)) {
        io.to(`user:${parentComment.user_id}`).emit('post:comment', formattedComment);
      }
    }
  } catch (sockErr) {
    logger.warn('POST_COMMENT', 'socket_emit_failed', { error: sockErr.message });
  }

  return formattedComment;
};

/**
 * Get comments for a post using keyset cursor pagination.
 * Eager-loads replies for each top-level comment.
 */
export const getComments = async (postId, { cursor, limit = 50, page = 1 } = {}) => {
  const safeLimit = Math.min(100, Math.max(1, Number(limit) || 50));

  let cursorWhere = {};
  if (cursor) {
    try {
      const decoded = JSON.parse(Buffer.from(cursor, 'base64').toString('utf8'));
      if (decoded.created_at && decoded.id) {
        cursorWhere = {
          [Op.or]: [
            { created_at: { [Op.gt]: new Date(decoded.created_at) } },
            {
              created_at: new Date(decoded.created_at),
              id: { [Op.gt]: Number(decoded.id) },
            },
          ],
        };
      }
    } catch {
      // Invalid cursor - ignore
    }
  }

  let rows = [];
  let totalCount = 0;

  const baseInclude = [
    {
      model: User,
      as: 'user',
      attributes: SAFE_USER_ATTRS,
      include: [{
        model: UserProfile,
        as: 'profile',
        attributes: SAFE_PROFILE_ATTRS,
        required: false,
      }],
    },
    {
      model: PostComment,
      as: 'replies',
      where: { is_deleted: false },
      required: false,
      include: [{
        model: User,
        as: 'user',
        attributes: SAFE_USER_ATTRS,
        include: [{
          model: UserProfile,
          as: 'profile',
          attributes: SAFE_PROFILE_ATTRS,
          required: false,
        }],
      }],
    },
  ];

  if (typeof PostComment.findAndCountAll === 'function') {
    try {
      const result = await PostComment.findAndCountAll({
        where: {
          post_id: postId,
          is_deleted: false,
          parent_id: null,
          ...cursorWhere,
        },
        include: baseInclude,
        distinct: true,
        order: [['created_at', 'ASC'], ['id', 'ASC']],
        limit: safeLimit + 1,
      });
      rows = result.rows || [];
      totalCount = result.count ?? rows.length;
    } catch {
      rows = await PostComment.findAll({
        where: {
          post_id: postId,
          is_deleted: false,
          parent_id: null,
          ...cursorWhere,
        },
        include: baseInclude,
        order: [['created_at', 'ASC'], ['id', 'ASC']],
        limit: safeLimit + 1,
      });
      totalCount = rows.length;
    }
  } else {
    rows = await PostComment.findAll({
      where: {
        post_id: postId,
        is_deleted: false,
        parent_id: null,
        ...cursorWhere,
      },
      include: baseInclude,
      order: [['created_at', 'ASC'], ['id', 'ASC']],
      limit: safeLimit + 1,
    });
    totalCount = rows.length;
  }

  const hasMore = rows.length > safeLimit;
  const pageRows = hasMore ? rows.slice(0, safeLimit) : rows;

  let nextCursor = null;
  if (hasMore && pageRows.length > 0) {
    const last = pageRows[pageRows.length - 1];
    nextCursor = Buffer.from(
      JSON.stringify({ id: Number(last.id), created_at: last.created_at }),
    ).toString('base64');
  }

  const serializedComments = pageRows.map((c) => {
    const rawReplies = Array.isArray(c.replies) ? c.replies : [];
    const sortedReplies = [...rawReplies].sort(
      (a, b) => new Date(a.created_at || 0) - new Date(b.created_at || 0) || Number(a.id) - Number(b.id)
    );

    return {
      id: Number(c.id),
      parentId: null,
      content: c.content,
      createdAt: toNormalizedIsoString(c.created_at),
      author: {
        userId: Number(c.user?.userId || c.user_id || 0),
        userName: c.user?.userName || null,
        fullName: c.user?.profile?.fullName || null,
        avatarUrl: c.user?.profile?.avatarUrl || null,
      },
      authorName: c.user?.profile?.fullName || c.user?.userName || 'User',
      replies: sortedReplies.map((r) => ({
        id: Number(r.id),
        parentId: Number(c.id),
        content: r.content,
        createdAt: toNormalizedIsoString(r.created_at),
        author: {
          userId: Number(r.user?.userId || r.user_id || 0),
          userName: r.user?.userName || null,
          fullName: r.user?.profile?.fullName || null,
          avatarUrl: r.user?.profile?.avatarUrl || null,
        },
        authorName: r.user?.profile?.fullName || r.user?.userName || 'User',
      })),
    };
  });

  return {
    total: totalCount,
    comments: serializedComments,
    nextCursor,
    hasMore,
    limit: safeLimit,
  };
};

/**
 * Get all active comments (admin / audit query)
 */
export const getAllComments = async () => {
  const comments = await PostComment.findAll({
    where: { is_deleted: false },
    include: [{
      model: User,
      as: 'user',
      attributes: SAFE_USER_ATTRS,
      include: [{ model: UserProfile, as: 'profile', attributes: SAFE_PROFILE_ATTRS, required: false }],
    }],
    order: [['created_at', 'DESC']],
    limit: 100,
  });
  return comments;
};

/**
 * Get comment by ID
 */
export const getCommentById = async (id) => {
  const comment = await PostComment.findOne({
    where: { id, is_deleted: false },
    include: [
      {
        model: User,
        as: 'user',
        attributes: SAFE_USER_ATTRS,
        include: [{ model: UserProfile, as: 'profile', attributes: SAFE_PROFILE_ATTRS, required: false }],
      },
      {
        model: PostComment,
        as: 'replies',
        where: { is_deleted: false },
        required: false,
      },
    ],
  });
  return comment;
};

/**
 * Update comment content
 */
export const updateComment = async (id, data) => {
  const comment = await PostComment.findOne({
    where: { id, is_deleted: false },
  });
  if (!comment) return null;

  if (data.content && data.content.trim()) {
    comment.content = data.content.trim();
  }
  await comment.save();
  return comment;
};

/**
 * Soft delete a comment - fully transactional with counter decrement
 */
export const softDeleteComment = async (id, deletedRemarks = null, updatedBy = null) => {
  const transaction = await sequelize.transaction();
  try {
    const comment = await PostComment.findOne({
      where: { id, is_deleted: false },
      transaction,
    });
    if (!comment) {
      await transaction.rollback();
      return null;
    }

    // Soft delete this comment and any child replies
    await PostComment.update(
      { is_deleted: true },
      { where: { [Op.or]: [{ id }, { parent_id: id }] }, transaction }
    );

    // Atomically decrement comments_count on Post
    if (comment.post_id) {
      await Post.decrement('comments_count', {
        by: 1,
        where: { id: comment.post_id, comments_count: { [Op.gt]: 0 } },
        transaction,
      });
    }

    await transaction.commit();

    // Broadcast deletion event via socket
    try {
      const io = getIO();
      if (io && comment.post_id) {
        io.to(`post:${comment.post_id}`).emit('post:comment:deleted', {
          commentId: Number(id),
          postId: Number(comment.post_id),
        });
      }
    } catch (_) {}

    return comment;
  } catch (err) {
    if (transaction && !transaction.finished) await transaction.rollback().catch(() => {});
    throw err;
  }
};

/**
 * Bulk soft delete comments
 */
export const bulkSoftDeleteComments = async (ids, deletedRemarks = null, updatedBy = null) => {
  if (!Array.isArray(ids) || ids.length === 0) return { affected: 0 };

  const transaction = await sequelize.transaction();
  try {
    const comments = await PostComment.findAll({
      where: { id: ids, is_deleted: false },
      attributes: ['id', 'post_id'],
      transaction,
    });

    if (comments.length === 0) {
      await transaction.rollback();
      return { affected: 0 };
    }

    await PostComment.update(
      { is_deleted: true },
      { where: { id: ids }, transaction }
    );

    // Group by post_id and decrement counters
    const postCounts = {};
    for (const c of comments) {
      if (c.post_id) {
        postCounts[c.post_id] = (postCounts[c.post_id] || 0) + 1;
      }
    }
    for (const [postId, count] of Object.entries(postCounts)) {
      await Post.decrement('comments_count', {
        by: count,
        where: { id: postId, comments_count: { [Op.gt]: 0 } },
        transaction,
      });
    }

    await transaction.commit();
    return { affected: comments.length };
  } catch (err) {
    if (transaction && !transaction.finished) await transaction.rollback().catch(() => {});
    throw err;
  }
};

export const getCommentsByPost = getComments;
export const createComment = async ({ post_id, user_id, content, parent_id }) => {
  return addComment(user_id, post_id, content, 'controller_req', parent_id);
};

export default {
  addComment,
  getComments,
  getCommentsByPost,
  createComment,
  getAllComments,
  getCommentById,
  updateComment,
  softDeleteComment,
  bulkSoftDeleteComments,
};
