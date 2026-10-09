import { Op } from 'sequelize';
import ResidentDocument from './resident_document.model.js';
import User from '../user/user.model.js';
import SocietyProfile from '../society_profile/society_profile.model.js';
import { logSocietyAudit } from '../society_profile/society_audit_log.service.js';

export const uploadResidentDocument = async (societyId, userId, data, meta = {}) => {
  const doc = await ResidentDocument.create({
    society_id: societyId,
    owner_id: userId,
    title: data.title,
    description: data.description || null,
    document_type: (data.document_type || 'other').toLowerCase(),
    flat_number: data.flat_number || null,
    file_url: data.file_url,
    file_type: data.file_type || null,
    file_size: data.file_size || null,
    status: data.status || 'private',
    created_by: userId,
    created_at: new Date(),
    updatedAt: new Date(),
  });

  await logSocietyAudit({
    societyId,
    actorUserId: userId,
    action: 'society.resident_document_uploaded',
    targetEntityType: 'resident_document',
    targetEntityId: doc.id,
    newValue: { title: doc.title, document_type: doc.document_type, status: doc.status },
    requestId: meta.requestId,
    ipAddress: meta.ip,
    userAgent: meta.userAgent,
  });

  return await getResidentDocumentById(doc.id, societyId);
};

export const getMyResidentDocuments = async (societyId, userId, query = {}) => {
  const page = Math.max(1, parseInt(query.page, 10) || 1);
  const limit = Math.min(100, Math.max(1, parseInt(query.limit, 10) || 50));
  const offset = (page - 1) * limit;

  const where = {
    society_id: societyId,
    owner_id: userId,
    is_deleted: false,
  };

  if (query.status && query.status !== 'all') {
    where.status = query.status.toLowerCase();
  }

  const docType = query.document_type || query.category;
  if (docType && docType !== 'all') {
    where.document_type = docType.toLowerCase();
  }

  return await ResidentDocument.findAll({
    where,
    limit,
    offset,
    order: [['created_at', 'DESC']],
    include: [
      { model: User, as: 'owner', attributes: ['userId', 'userName', 'email'] },
      { model: User, as: 'verifier', attributes: ['userId', 'userName', 'email'] },
    ],
  });
};

export const getSharedResidentDocuments = async (societyId, query = {}) => {
  const page = Math.max(1, parseInt(query.page, 10) || 1);
  const limit = Math.min(100, Math.max(1, parseInt(query.limit, 10) || 50));
  const offset = (page - 1) * limit;

  const where = {
    society_id: societyId,
    is_deleted: false,
    status: { [Op.ne]: 'private' },
  };

  if (query.status && query.status !== 'all') {
    where.status = query.status.toLowerCase();
  }

  if (query.flat_number && query.flat_number.trim()) {
    where.flat_number = { [Op.like]: `%${query.flat_number.trim()}%` };
  }

  return await ResidentDocument.findAll({
    where,
    limit,
    offset,
    order: [['created_at', 'DESC']],
    include: [
      { model: User, as: 'owner', attributes: ['userId', 'userName', 'email'] },
      { model: User, as: 'verifier', attributes: ['userId', 'userName', 'email'] },
    ],
  });
};

export const getResidentDocumentById = async (id, societyId) => {
  const where = { id, is_deleted: false };
  if (societyId) where.society_id = societyId;

  return await ResidentDocument.findOne({
    where,
    include: [
      { model: User, as: 'owner', attributes: ['userId', 'userName', 'email'] },
      { model: User, as: 'verifier', attributes: ['userId', 'userName', 'email'] },
    ],
  });
};

export const shareResidentDocument = async (id, societyId, userId, meta = {}) => {
  const where = { id, is_deleted: false };
  if (societyId) where.society_id = societyId;

  const doc = await ResidentDocument.findOne({ where });
  if (!doc) return null;

  await doc.update({
    status: 'shared_for_verification',
    updated_by: userId,
    updatedAt: new Date(),
  });

  await logSocietyAudit({
    societyId: doc.society_id,
    actorUserId: userId,
    action: 'society.resident_document_shared',
    targetEntityType: 'resident_document',
    targetEntityId: doc.id,
    requestId: meta.requestId,
    ipAddress: meta.ip,
    userAgent: meta.userAgent,
  });

  return await getResidentDocumentById(doc.id, doc.society_id);
};

export const verifyResidentDocument = async (id, societyId, adminUserId, { status, rejection_reason }, meta = {}) => {
  const where = { id, is_deleted: false };
  if (societyId) where.society_id = societyId;

  const doc = await ResidentDocument.findOne({ where });
  if (!doc) return null;

  const newStatus = status.toLowerCase();
  await doc.update({
    status: newStatus,
    rejection_reason: newStatus === 'rejected' ? (rejection_reason || null) : null,
    verified_by: adminUserId,
    verified_at: new Date(),
    updated_by: adminUserId,
    updatedAt: new Date(),
  });

  await logSocietyAudit({
    societyId: doc.society_id,
    actorUserId: adminUserId,
    action: `society.resident_document_${newStatus}`,
    targetEntityType: 'resident_document',
    targetEntityId: doc.id,
    reason: rejection_reason || null,
    newValue: { status: newStatus, verified_by: adminUserId },
    requestId: meta.requestId,
    ipAddress: meta.ip,
    userAgent: meta.userAgent,
  });

  return await getResidentDocumentById(doc.id, doc.society_id);
};

export const deleteResidentDocument = async (id, societyId, userId, remarks = null, meta = {}) => {
  const where = { id, is_deleted: false };
  if (societyId) where.society_id = societyId;

  const doc = await ResidentDocument.findOne({ where });
  if (!doc) return null;

  await doc.update({
    is_deleted: true,
    deletedRemarks: remarks || 'Deleted by user',
    updated_by: userId,
    updatedAt: new Date(),
  });

  await logSocietyAudit({
    societyId: doc.society_id,
    actorUserId: userId,
    action: 'society.resident_document_deleted',
    targetEntityType: 'resident_document',
    targetEntityId: doc.id,
    reason: remarks,
    requestId: meta.requestId,
    ipAddress: meta.ip,
    userAgent: meta.userAgent,
  });

  return true;
};
