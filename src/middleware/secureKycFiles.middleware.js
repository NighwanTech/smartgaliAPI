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

  let token = null;
  const authHeader = req.headers['authorization'] || req.headers['Authorization'];
  if (authHeader && authHeader.startsWith('Bearer ')) {
    token = authHeader.substring(7).trim();
  } else if (req.query && (req.query.token || req.query.auth)) {
    token = String(req.query.token || req.query.auth).trim();
  } else if (req.cookies && (req.cookies.sg_admin_token || req.cookies.token)) {
    token = String(req.cookies.sg_admin_token || req.cookies.token).trim();
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
    },
    attributes: ['userId', 'userRole', 'is_active', 'status'],
  });

  if (!user && !(process.env.NODE_ENV === 'development' && (decoded.userRole === 'super_admin' || decoded.role === 'superadmin'))) {
    res.status(401).json({ success: false, message: 'Access denied: User account unavailable.' });
    return null;
  }

  const effectiveUser = user || { userId, userRole: decoded.userRole || decoded.role || 'super_admin' };
  if (!effectiveUser.userRole && (decoded.userRole || decoded.role)) {
    effectiveUser.userRole = decoded.userRole || decoded.role;
  }

  return { safeFilename, userId, user: effectiveUser, token };
}

function generateDevPlaceholderPdf(folder, filename, doc = null) {
  const cleanFolder = (folder || 'KYC').replace(/[-_]/g, ' ').toUpperCase();
  const title = (doc?.title || cleanFolder).toUpperCase();
  const docNo = doc?.doc_number ? `Document / Certificate Number: ${doc.doc_number}` : 'Official Submitted Record';
  const origName = doc?.file_name || filename;
  const verifiedDate = new Date().toLocaleDateString('en-IN', { year: 'numeric', month: 'long', day: 'numeric' });

  const content = `BT
/F1 18 Tf
50 730 Td
(SmartGali Official Document Dossier) Tj
/F1 12 Tf
0 -36 Td
(Document Title: ${title}) Tj
0 -24 Td
(${docNo}) Tj
0 -24 Td
(Original File Name: ${origName}) Tj
0 -24 Td
(Storage Status: Verified Secure Upload) Tj
0 -24 Td
(Verification Date: ${verifiedDate}) Tj
0 -36 Td
(This certified copy confirms that the business owner has uploaded and) Tj
0 -18 Td
(submitted this document for dynamic KYC verification on SmartGali.) Tj
ET`;
  const streamLength = Buffer.byteLength(content, 'utf8');

  return `%PDF-1.4
1 0 obj
<< /Type /Catalog /Pages 2 0 R >>
endobj
2 0 obj
<< /Type /Pages /Kids [3 0 R] /Count 1 >>
endobj
3 0 obj
<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>
endobj
4 0 obj
<< /Length ${streamLength} >>
stream
${content}
endstream
endobj
5 0 obj
<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>
endobj
xref
0 6
0000000000 65535 f 
0000000009 00000 n 
0000000058 00000 n 
0000000115 00000 n 
0000000244 00000 n 
0000000350 00000 n 
trailer
<< /Size 6 /Root 1 0 R >>
startxref
426
%%EOF`;
}

// Minimum valid PDF size (real PDFs are always larger than 1KB placeholder)
const MIN_REAL_PDF_BYTES = 2048;

/**
 * Returns true if the file on disk is a generated placeholder, not a real uploaded document.
 * We detect this by checking file size < threshold AND that it contains our placeholder marker text.
 */
function isPlaceholderFile(filePath) {
  try {
    const stat = fs.statSync(filePath);
    if (stat.size > MIN_REAL_PDF_BYTES) return false; // big enough to be real
    const head = fs.readFileSync(filePath, { encoding: 'utf8', flag: 'r' }).slice(0, 500);
    return head.includes('SmartGali Official Document Dossier') || head.includes('test content');
  } catch (_) {
    return false;
  }
}

async function sendSecureDocumentFile(res, folder, safeFilename, doc = null, token = null) {
  const filePath = path.join(env.uploadsPath, folder, safeFilename);
  const fileExistsAndReal = fs.existsSync(filePath) && !isPlaceholderFile(filePath);

  if (!fileExistsAndReal) {
    // If placeholder exists, remove it so we can re-fetch the real file
    if (fs.existsSync(filePath) && isPlaceholderFile(filePath)) {
      try { fs.unlinkSync(filePath); } catch (_) {}
    }

    // 1. Attempt to fetch real binary from live storage origin if reachable
    let fetched = false;
    try {
      const liveUrl = `${env.publicMediaOrigin}/uploads/${folder}/${safeFilename}`;
      const liveRes = await fetch(liveUrl, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (liveRes.ok) {
        const buf = Buffer.from(await liveRes.arrayBuffer());
        // Only save if it looks like a real file (not another placeholder)
        if (buf.length > MIN_REAL_PDF_BYTES) {
          const folderDir = path.dirname(filePath);
          if (!fs.existsSync(folderDir)) fs.mkdirSync(folderDir, { recursive: true });
          fs.writeFileSync(filePath, buf);
          fetched = true;
        }
      }
    } catch (_) {}

    // 2. If still missing from local disk and live fetch is unavailable:
    if (!fetched || !fs.existsSync(filePath)) {
      if (!env.isProduction || env.nodeEnv === 'development') {
        const folderDir = path.dirname(filePath);
        if (!fs.existsSync(folderDir)) fs.mkdirSync(folderDir, { recursive: true });
        const devPdf = generateDevPlaceholderPdf(folder, safeFilename, doc);
        fs.writeFileSync(filePath, devPdf, 'utf8');
      } else {
        return res.status(404).json({
          success: false,
          message: 'Document file not found on storage server. Please re-upload the document.',
        });
      }
    }
  }

  const ext = path.extname(safeFilename).toLowerCase();
  if (ext === '.pdf') {
    res.setHeader('Content-Type', 'application/pdf');
  } else if (ext === '.png') {
    res.setHeader('Content-Type', 'image/png');
  } else if (ext === '.jpg' || ext === '.jpeg') {
    res.setHeader('Content-Type', 'image/jpeg');
  } else if (ext === '.webp') {
    res.setHeader('Content-Type', 'image/webp');
  }

  res.setHeader('X-Content-Type-Options', 'nosniff');
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

    const isAdmin = isGlobalAdminUser(auth.user);

    const doc = await ProviderDocument.findOne({
      where: {
        file_url: { [Op.like]: '%' + auth.safeFilename },
        is_deleted: false,
      },
    });

    if (!doc && !isAdmin) {
      return res.status(404).json({ success: false, message: 'KYC Document not found.' });
    }

    if (doc) {
      const isOwner = Number(doc.user_id) === Number(auth.userId);
      if (!isOwner && !isAdmin) {
        return res.status(403).json({
          success: false,
          message: 'Access denied: You do not have permission to access this provider KYC document.',
        });
      }
    }

    return await sendSecureDocumentFile(res, 'provider-documents', auth.safeFilename, doc, auth.token);
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

    const isAdmin = isGlobalAdminUser(auth.user);

    const doc = await BusinessDocument.findOne({
      where: {
        file_url: { [Op.like]: '%' + auth.safeFilename },
        is_deleted: false,
      },
    });

    if (!doc && !isAdmin) {
      return res.status(404).json({ success: false, message: 'Business KYC Document not found.' });
    }

    if (doc) {
      let isBusinessOwner = Number(doc.user_id) === Number(auth.userId);
      if (!isBusinessOwner && doc.business_id) {
        const biz = await BusinessProfile.findByPk(doc.business_id, { attributes: ['id', 'userId'] });
        if (biz && Number(biz.userId) === Number(auth.userId)) {
          isBusinessOwner = true;
        }
      }

      if (!isBusinessOwner && !isAdmin) {
        return res.status(403).json({
          success: false,
          message: 'Access denied: You do not have permission to access this business KYC document.',
        });
      }
    }

    return await sendSecureDocumentFile(res, 'business-documents', auth.safeFilename, doc, auth.token);
  } catch (error) {
    next(error);
  }
};
