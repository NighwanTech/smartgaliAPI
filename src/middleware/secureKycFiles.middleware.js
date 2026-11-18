import path from 'path';
import fs from 'fs';
import jwt from 'jsonwebtoken';
import env from '../config/env.js';
import ProviderDocument from '../modules/service_provider_profile/provider_document.model.js';
import BusinessDocument from '../modules/business_kyc/business_document.model.js';
import BusinessProfile from '../modules/business_profile/business_profile.model.js';
import User from '../modules/user/user.model.js';
import { isGlobalAdminUser } from './auth.middleware.js';
import { Op } from 'sequelize';

/**
 * Shared authentication + filename validation for private KYC document folders.
 */
async function authenticatePrivateDocRequest(req, res, rootFolder) {
  const rawPath = req.path || '';
  const safeFilename = path.basename(rawPath);

  if (!safeFilename || safeFilename === '.' || safeFilename === rootFolder) {
    res.status(404).json({ success: false, message: 'Document filename not specified.' });
    return null;
  }

  if (!/^[a-zA-Z0-9._-]+$/.test(safeFilename) || safeFilename.includes('..')) {
    res.status(400).json({ success: false, message: 'Invalid or unsafe document filename.' });
    return null;
  }

  if (req.query && req.query.token) {
    res.status(401).json({
      success: false,
      message: 'Access denied: URL query tokens are prohibited for private KYC documents. Use Authorization: Bearer <token> header.',
    });
    return null;
  }

  let token = null;
  const authHeader = req.headers['authorization'] || req.headers['Authorization'];
  if (authHeader && authHeader.startsWith('Bearer ')) {
    token = authHeader.substring(7).trim();
  }

  if (!token) {
    res.status(401).json({
      success: false,
      message: 'Access denied: Authentication token required to access sensitive KYC documents.',
    });
    return null;
  }

  let decoded;
  try {
    decoded = jwt.verify(token, env.jwt.secret);
  } catch (err) {
    res.status(401).json({
      success: false,
      message: err.name === 'TokenExpiredError' ? 'Access denied: Token expired.' : 'Access denied: Invalid token.',
    });
    return null;
  }

  const userId = decoded.id ?? decoded.userId ?? decoded.sub;
  if (!userId) {
    res.status(401).json({ success: false, message: 'Access denied: Invalid token payload.' });
    return null;
  }

  const user = await User.findOne({
    where: {
      userId,
      is_deleted: false,
      is_active: true,
      status: 'active',
    },
    attributes: ['userId', 'userRole'],
  });

  if (!user) {
    res.status(401).json({ success: false, message: 'Access denied: User account unavailable.' });
    return null;
  }

  return { safeFilename, userId, user };
}

function sendSecureDocumentFile(res, folder, safeFilename) {
  const filePath = path.join(env.uploadsPath, folder, safeFilename);
  if (!fs.existsSync(filePath)) {
    return res.status(404).json({ success: false, message: 'Document file not found on storage server.' });
  }

  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Content-Security-Policy', "default-src 'none'; sandbox");
  res.setHeader('Content-Disposition', 'inline; filename="' + safeFilename + '"');
  return res.sendFile(filePath);
}

/**
 * Middleware to secure private KYC provider documents.
 * Rejects unauthenticated requests and verifies document ownership or admin authority.
 */
export const secureProviderDocuments = async (req, res, next) => {
  try {
    const auth = await authenticatePrivateDocRequest(req, res, 'provider-documents');
    if (!auth) return;

    const doc = await ProviderDocument.findOne({
      where: {
        file_url: { [Op.like]: '%' + auth.safeFilename },
        is_deleted: false,
      },
    });

    if (!doc) {
      return res.status(404).json({ success: false, message: 'KYC Document not found.' });
    }

    const isOwner = Number(doc.user_id) === Number(auth.userId);
    const isAdmin = isGlobalAdminUser(auth.user);

    if (!isOwner && !isAdmin) {
      return res.status(403).json({
        success: false,
        message: 'Access denied: You do not have permission to access this provider KYC document.',
      });
    }

    return sendSecureDocumentFile(res, 'provider-documents', auth.safeFilename);
  } catch (error) {
    next(error);
  }
};

/**
 * Middleware to secure private business KYC documents (PAN, GST, FSSAI, Drug Licence, Bank proof).
 * Rejects unauthenticated callers and enforces owner or global admin access.
 */
export const secureBusinessDocuments = async (req, res, next) => {
  try {
    const auth = await authenticatePrivateDocRequest(req, res, 'business-documents');
    if (!auth) return;

    const doc = await BusinessDocument.findOne({
      where: {
        file_url: { [Op.like]: '%' + auth.safeFilename },
        is_deleted: false,
      },
    });

    if (!doc) {
      return res.status(404).json({ success: false, message: 'Business KYC Document not found.' });
    }

    let isBusinessOwner = Number(doc.user_id) === Number(auth.userId);
    if (!isBusinessOwner && doc.business_id) {
      const biz = await BusinessProfile.findByPk(doc.business_id, { attributes: ['id', 'userId'] });
      if (biz && Number(biz.userId) === Number(auth.userId)) {
        isBusinessOwner = true;
      }
    }

    if (!isBusinessOwner && !isGlobalAdminUser(auth.user)) {
      return res.status(403).json({
        success: false,
        message: 'Access denied: You do not have permission to access this business KYC document.',
      });
    }

    return sendSecureDocumentFile(res, 'business-documents', auth.safeFilename);
  } catch (error) {
    next(error);
  }
};
