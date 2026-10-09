import { Op } from 'sequelize';
import sequelize from '../../config/db.js';
import SocietyDocument from './society_document.model.js';
import SocietyDocumentVersion from './society_document_version.model.js';
import SocietyDocumentAcknowledgement from './society_document_acknowledgement.model.js';
import SocietyMember from '../society_member/society_member.model.js';
import SocietyAuditLog from '../society_profile/society_audit_log.model.js';
import User from '../user/user.model.js';
import { createEvent } from '../outbox/outbox.service.js';
import { logSocietyAudit } from '../society_profile/society_audit_log.service.js';

export const createDocument = async (societyId, userId, docData, meta = {}) => {
  const transaction = await sequelize.transaction();
  try {
    const document = await SocietyDocument.create({
      society_id: societyId,
      title: docData.title,
      document_number: docData.document_number || null,
      version: docData.version || '1.0',
      description: docData.description || null,
      file_url: docData.file_url,
      file_type: docData.file_type || null,
      file_size: docData.file_size || null,
      category: (docData.category || 'general').toLowerCase(),
      priority: docData.priority || 'normal',
      visibility: docData.visibility || 'all',
      allowed_roles: docData.allowed_roles ? (typeof docData.allowed_roles === 'string' ? docData.allowed_roles : JSON.stringify(docData.allowed_roles)) : null,
      tags: docData.tags ? (typeof docData.tags === 'string' ? docData.tags : JSON.stringify(docData.tags)) : null,
      requires_approval: docData.requires_approval === true || docData.requires_approval === 'true',
      acknowledgement_required: docData.acknowledgement_required === true || docData.acknowledgement_required === 'true',
      effective_from: docData.effective_from || null,
      expiry_date: docData.expiry_date || null,
      scheduled_publish_at: docData.scheduled_publish_at || null,
      status: docData.status || 'published',
      is_official: docData.is_official !== false && docData.is_official !== 'false',
      uploaded_by: userId,
      created_by: userId,
      created_at: new Date(),
    }, { transaction });

    // Create initial version record
    await SocietyDocumentVersion.create({
      document_id: document.id,
      society_id: societyId,
      version: document.version || '1.0',
      title: document.title,
      file_url: document.file_url,
      file_type: document.file_type,
      file_size: document.file_size,
      change_summary: 'Initial official release',
      created_by: userId,
      created_at: new Date(),
    }, { transaction });

    await logSocietyAudit({
      societyId,
      actorUserId: userId,
      action: 'society.document_created',
      targetEntityType: 'document',
      targetEntityId: document.id,
      newValue: { title: document.title, category: document.category, file_url: document.file_url },
      requestId: meta.requestId,
      ipAddress: meta.ip,
      userAgent: meta.userAgent,
    }, { transaction });

    await createEvent({
      event_type: 'society.document_uploaded',
      aggregate_type: 'society',
      aggregate_id: String(societyId),
      payload: {
        societyId: Number(societyId),
        documentId: Number(document.id),
        title: document.title,
        category: document.category,
        uploadedBy: Number(userId),
      },
    }, { transaction });

    await transaction.commit();
    return document;
  } catch (error) {
    if (transaction && !transaction.finished) await transaction.rollback().catch(() => {});
    throw error;
  }
};

export const getAllDocuments = async (societyId, query = {}) => {
  const page = Math.max(1, parseInt(query.page, 10) || 1);
  const limit = Math.min(100, Math.max(1, parseInt(query.limit, 10) || 20));
  const offset = (page - 1) * limit;

  const where = {
    society_id: societyId,
    is_deleted: false,
  };

  if (query.category && query.category !== 'all') {
    where.category = query.category.toLowerCase();
  }

  if (query.status && query.status !== 'all') {
    where.status = query.status.toLowerCase();
  }

  if (query.priority && query.priority !== 'all') {
    where.priority = query.priority.toLowerCase();
  }

  if (query.visibility && query.visibility !== 'all') {
    where.visibility = query.visibility.toLowerCase();
  }

  if (query.search) {
    where[Op.or] = [
      { title: { [Op.like]: `%${query.search}%` } },
      { description: { [Op.like]: `%${query.search}%` } },
      { document_number: { [Op.like]: `%${query.search}%` } },
    ];
  }

  const { rows, count } = await SocietyDocument.findAndCountAll({
    where,
    limit,
    offset,
    order: [['created_at', 'DESC']],
    include: [
      {
        model: User,
        as: 'uploader',
        attributes: ['userId', 'userName', 'email'],
      },
    ],
  });

  return {
    data: rows,
    total: count,
    page,
    limit,
    totalPages: Math.ceil(count / limit) || 1,
  };
};

export const getDocumentById = async (id, societyId) => {
  const where = {
    id,
    is_deleted: false,
  };
  if (societyId) where.society_id = societyId;

  return SocietyDocument.findOne({
    where,
    include: [
      {
        model: User,
        as: 'uploader',
        attributes: ['userId', 'userName', 'email'],
      },
    ],
  });
};

export const updateDocument = async (id, societyId, updateData, userId, meta = {}) => {
  const where = { id, is_deleted: false };
  if (societyId) where.society_id = societyId;

  const document = await SocietyDocument.findOne({ where });
  if (!document) return null;

  const transaction = await sequelize.transaction();
  try {
    const oldValue = document.toJSON();
    const fields = {};
    if (updateData.title !== undefined) fields.title = updateData.title;
    if (updateData.document_number !== undefined) fields.document_number = updateData.document_number;
    if (updateData.description !== undefined) fields.description = updateData.description;
    if (updateData.category !== undefined) fields.category = updateData.category.toLowerCase();
    if (updateData.priority !== undefined) fields.priority = updateData.priority;
    if (updateData.visibility !== undefined) fields.visibility = updateData.visibility;
    if (updateData.allowed_roles !== undefined) {
      fields.allowed_roles = typeof updateData.allowed_roles === 'string'
        ? updateData.allowed_roles
        : JSON.stringify(updateData.allowed_roles);
    }
    if (updateData.tags !== undefined) {
      fields.tags = typeof updateData.tags === 'string'
        ? updateData.tags
        : JSON.stringify(updateData.tags);
    }
    if (updateData.requires_approval !== undefined) fields.requires_approval = Boolean(updateData.requires_approval);
    if (updateData.acknowledgement_required !== undefined) fields.acknowledgement_required = Boolean(updateData.acknowledgement_required);
    if (updateData.effective_from !== undefined) fields.effective_from = updateData.effective_from;
    if (updateData.expiry_date !== undefined) fields.expiry_date = updateData.expiry_date;
    if (updateData.status !== undefined) fields.status = updateData.status;

    fields.updated_by = userId;
    fields.updatedAt = new Date();

    await document.update(fields, { transaction });

    await logSocietyAudit({
      societyId: document.society_id,
      actorUserId: userId,
      action: 'society.document_updated',
      targetEntityType: 'document',
      targetEntityId: document.id,
      oldValue,
      newValue: document.toJSON(),
      requestId: meta.requestId,
      ipAddress: meta.ip,
      userAgent: meta.userAgent,
    }, { transaction });

    await transaction.commit();
    return document;
  } catch (error) {
    if (transaction && !transaction.finished) await transaction.rollback().catch(() => {});
    throw error;
  }
};

export const createDocumentVersion = async (documentId, societyId, userId, data, meta = {}) => {
  const where = { id: documentId, is_deleted: false };
  if (societyId) where.society_id = societyId;

  const document = await SocietyDocument.findOne({ where });
  if (!document) return null;

  const transaction = await sequelize.transaction();
  try {
    const versionRecord = await SocietyDocumentVersion.create({
      document_id: document.id,
      society_id: document.society_id,
      version: data.version || '1.1',
      title: data.title || document.title,
      file_url: data.file_url || document.file_url,
      file_type: data.file_type || document.file_type,
      file_size: data.file_size || document.file_size,
      change_summary: data.change_summary || null,
      created_by: userId,
      created_at: new Date(),
    }, { transaction });

    const updateFields = {
      version: versionRecord.version,
      updated_by: userId,
      updatedAt: new Date(),
    };
    if (data.file_url) updateFields.file_url = data.file_url;
    if (data.file_type) updateFields.file_type = data.file_type;
    if (data.file_size) updateFields.file_size = data.file_size;
    if (data.title) updateFields.title = data.title;

    await document.update(updateFields, { transaction });

    await logSocietyAudit({
      societyId: document.society_id,
      actorUserId: userId,
      action: 'society.document_version_created',
      targetEntityType: 'document',
      targetEntityId: document.id,
      newValue: versionRecord.toJSON(),
      requestId: meta.requestId,
      ipAddress: meta.ip,
      userAgent: meta.userAgent,
    }, { transaction });

    await transaction.commit();
    return document;
  } catch (error) {
    if (transaction && !transaction.finished) await transaction.rollback().catch(() => {});
    throw error;
  }
};

export const getDocumentVersions = async (documentId, societyId) => {
  const where = { document_id: documentId };
  if (societyId) where.society_id = societyId;

  return await SocietyDocumentVersion.findAll({
    where,
    order: [['created_at', 'DESC']],
    include: [
      {
        model: User,
        as: 'creator',
        attributes: ['userId', 'userName', 'email'],
      },
    ],
  });
};

export const updateDocumentStatus = async (documentId, societyId, userId, { status, reason }, meta = {}) => {
  const where = { id: documentId, is_deleted: false };
  if (societyId) where.society_id = societyId;

  const document = await SocietyDocument.findOne({ where });
  if (!document) return null;

  const transaction = await sequelize.transaction();
  try {
    const oldValue = { status: document.status };
    await document.update({
      status: status.toLowerCase(),
      updated_by: userId,
      updatedAt: new Date(),
    }, { transaction });

    await logSocietyAudit({
      societyId: document.society_id,
      actorUserId: userId,
      action: 'society.document_status_changed',
      targetEntityType: 'document',
      targetEntityId: document.id,
      reason,
      oldValue,
      newValue: { status: document.status },
      requestId: meta.requestId,
      ipAddress: meta.ip,
      userAgent: meta.userAgent,
    }, { transaction });

    await transaction.commit();
    return document;
  } catch (error) {
    if (transaction && !transaction.finished) await transaction.rollback().catch(() => {});
    throw error;
  }
};

export const acknowledgeDocument = async (documentId, societyId, userId, version = '1.0', meta = {}) => {
  const where = { id: documentId, is_deleted: false };
  if (societyId) where.society_id = societyId;

  const document = await SocietyDocument.findOne({ where });
  if (!document) return null;

  const [ack, created] = await SocietyDocumentAcknowledgement.findOrCreate({
    where: {
      document_id: document.id,
      user_id: userId,
    },
    defaults: {
      version: version || document.version || '1.0',
      acknowledged_at: new Date(),
    },
  });

  if (!created) {
    await ack.update({
      version: version || document.version || '1.0',
      acknowledged_at: new Date(),
    });
  }

  await logSocietyAudit({
    societyId: document.society_id,
    actorUserId: userId,
    action: 'society.document_acknowledged',
    targetEntityType: 'document',
    targetEntityId: document.id,
    newValue: { version: ack.version, acknowledged_at: ack.acknowledged_at },
    requestId: meta.requestId,
    ipAddress: meta.ip,
    userAgent: meta.userAgent,
  });

  return ack;
};

export const getDocumentAcknowledgements = async (documentId, societyId) => {
  const where = { id: documentId, is_deleted: false };
  if (societyId) where.society_id = societyId;

  const document = await SocietyDocument.findOne({ where });
  if (!document) return null;

  const acks = await SocietyDocumentAcknowledgement.findAll({
    where: { document_id: document.id },
    order: [['acknowledged_at', 'DESC']],
    include: [
      {
        model: User,
        as: 'user',
        attributes: ['userId', 'userName', 'email'],
      },
    ],
  });

  const totalMembers = await SocietyMember.count({
    where: { society_id: document.society_id, is_deleted: false, status: 'active' },
  });

  const totalAck = acks.length;
  const percentage = totalMembers > 0 ? Math.round((totalAck / totalMembers) * 100) : 0;

  return {
    total_acknowledged: totalAck,
    total_audience: totalMembers,
    percentage,
    acknowledgements: acks,
  };
};

export const getDocumentAuditHistory = async (documentId, societyId) => {
  const where = {
    target_entity_type: 'document',
    target_entity_id: documentId,
  };
  if (societyId) where.society_id = societyId;

  return await SocietyAuditLog.findAll({
    where,
    order: [['created_at', 'DESC']],
    include: [
      {
        model: User,
        as: 'actor',
        attributes: ['userId', 'userName', 'email'],
      },
    ],
  });
};

export const deleteDocument = async (id, societyId, userId, meta = {}) => {
  const where = { id, is_deleted: false };
  if (societyId) where.society_id = societyId;

  const document = await SocietyDocument.findOne({ where });
  if (!document) return null;

  const transaction = await sequelize.transaction();
  try {
    await document.update({
      is_deleted: true,
      updated_by: userId,
      deletedRemarks: meta.remarks || 'Document deleted by admin',
      updatedAt: new Date(),
    }, { transaction });

    await logSocietyAudit({
      societyId: document.society_id,
      actorUserId: userId,
      action: 'society.document_deleted',
      targetEntityType: 'document',
      targetEntityId: document.id,
      reason: meta.remarks || 'Document deleted by admin',
      requestId: meta.requestId,
      ipAddress: meta.ip,
      userAgent: meta.userAgent,
    }, { transaction });

    await transaction.commit();
    return true;
  } catch (error) {
    if (transaction && !transaction.finished) await transaction.rollback().catch(() => {});
    throw error;
  }
};
