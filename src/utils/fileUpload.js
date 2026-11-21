import multer from 'multer';
import path from 'path';
import fs from 'fs';
import crypto from 'crypto';
import env from '../config/env.js';

const IMAGE_EXTENSIONS = Object.freeze({
  'image/jpeg': '.jpg',
  'image/jpg': '.jpg',
  'image/pjpeg': '.jpg',
  'image/png': '.png',
  'image/x-png': '.png',
  'image/webp': '.webp',
  'image/gif': '.gif',
  'image/heic': '.heic',
  'image/heif': '.heif',
  'image/bmp': '.bmp',
});

const ALLOWED_IMAGE_EXT_SET = new Set([
  '.jpg',
  '.jpeg',
  '.png',
  '.webp',
  '.gif',
  '.heic',
  '.heif',
  '.bmp',
]);

const resolveImageExtension = (file) => {
  const mime = (file?.mimetype || '').toLowerCase().split(';')[0].trim();
  if (IMAGE_EXTENSIONS[mime]) return IMAGE_EXTENSIONS[mime];
  let ext = path.extname(file?.originalname || '').toLowerCase().trim();
  if (ext === '.jpeg' || ext === '.jpe') ext = '.jpg';
  if (ext && ALLOWED_IMAGE_EXT_SET.has(ext)) {
    return ext === '.jpeg' ? '.jpg' : ext;
  }
  if (!mime || mime === 'application/octet-stream' || mime === 'binary/octet-stream') {
    if (ext && ALLOWED_IMAGE_EXT_SET.has(ext)) {
      return ext === '.jpeg' ? '.jpg' : ext;
    }
    // Safe default for camera / gallery photos without extension
    return '.jpg';
  }
  return null;
};

const COMMUNITY_DOCUMENT_EXTENSIONS = Object.freeze({
  'application/pdf': '.pdf',
  'application/x-pdf': '.pdf',
  'application/msword': '.doc',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': '.docx',
  'application/vnd.ms-excel': '.xls',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': '.xlsx',
  'text/plain': '.txt',
});

const ALLOWED_DOC_EXT_SET = new Set([
  '.jpg',
  '.jpeg',
  '.png',
  '.webp',
  '.gif',
  '.pdf',
  '.doc',
  '.docx',
  '.xls',
  '.xlsx',
  '.txt',
  '.heic',
  '.heif',
]);

const resolveTypedExtension = (file, extensions) => {
  const mime = (file?.mimetype || '').toLowerCase().split(';')[0].trim();
  if (extensions[mime]) return extensions[mime];

  let ext = path.extname(file?.originalname || '').toLowerCase().trim();
  if (ext === '.jpeg' || ext === '.jpe') ext = '.jpg';

  if (ext) {
    if (ALLOWED_DOC_EXT_SET.has(ext)) {
      return ext === '.jpeg' ? '.jpg' : ext;
    }
    const matched = Object.entries(extensions).find(([, val]) => val === ext);
    if (matched) return matched[1];
  }

  // Fallback based on normalized MIME prefixes
  if (mime === 'image/jpeg' || mime === 'image/jpg' || mime === 'image/pjpeg') return '.jpg';
  if (mime === 'image/png' || mime === 'image/x-png') return '.png';
  if (mime === 'application/pdf' || mime === 'application/x-pdf') return '.pdf';
  if (mime === 'image/webp') return '.webp';
  if (mime === 'image/gif') return '.gif';

  // Generic octet-stream fallback: camera / mobile binary uploads default to .jpg
  if (!mime || mime === 'application/octet-stream' || mime === 'binary/octet-stream') {
    if (ext && ALLOWED_DOC_EXT_SET.has(ext)) {
      return ext === '.jpeg' ? '.jpg' : ext;
    }
    return '.jpg';
  }

  return null;
};

const COMMUNITY_MEDIA_EXTENSIONS = Object.freeze({
  ...IMAGE_EXTENSIONS,
  'video/mp4': '.mp4',
  'video/quicktime': '.mov',
  'video/webm': '.webm',
});

export const isAllowedImageMime = (mimeType) =>
  Boolean(IMAGE_EXTENSIONS[String(mimeType || '').toLowerCase().trim()]);

export const safeFolder = (folderName) => {
  if (!/^[a-zA-Z0-9_-]+$/.test(folderName)) {
    throw new Error('Invalid upload folder.');
  }
  return folderName;
};

/**
 * Global Image Upload Utility
 * This handles saving files locally in a structured folder format (e.g. uploads/profile/)
 * 
 * Future AWS S3 Migration:
 * When moving to AWS S3, you can replace `multer.diskStorage` below with `multer-s3`.
 * This ensures you don't need to change any of the routes using this middleware.
 */

export const uploadImage = (folderName = 'general') => {
  const folder = safeFolder(folderName);
  const storage = multer.diskStorage({
    destination: (req, file, cb) => {
      const uploadPath = path.join(env.uploadsPath, folder);
      
      // Automatically create the folder (e.g., uploads/profile) if it doesn't exist
      if (!fs.existsSync(uploadPath)) {
        fs.mkdirSync(uploadPath, { recursive: true });
      }
      
      cb(null, uploadPath);
    },
    filename: (req, file, cb) => {
      const extension = resolveImageExtension(file);
      if (!extension) {
        const error = new Error('Only JPEG, PNG, WebP, and GIF images are allowed.');
        error.code = 'INVALID_IMAGE_TYPE';
        return cb(error);
      }
      cb(null, `${crypto.randomUUID()}${extension}`);
    }
  });

  const fileFilter = (req, file, cb) => {
    if (resolveImageExtension(file)) {
      cb(null, true);
    } else {
      const error = new Error('Only JPEG, PNG, WebP, and GIF images are allowed.');
      error.code = 'INVALID_IMAGE_TYPE';
      cb(error, false);
    }
  };

  return multer({
    storage,
    fileFilter,
    limits: { fileSize: 5 * 1024 * 1024 } // 5 MB file size limit
  });
};

const uploadTypedFile = (folderName, extensions, maxBytes) => {
  const folder = safeFolder(folderName);
  const storage = multer.diskStorage({
    destination: (_req, _file, cb) => {
      const uploadPath = path.join(env.uploadsPath, folder);
      fs.mkdirSync(uploadPath, { recursive: true });
      cb(null, uploadPath);
    },
    filename: (_req, file, cb) => {
      const extension = file.resolvedExtension || resolveTypedExtension(file, extensions) || '.jpg';
      cb(null, `${crypto.randomUUID()}${extension}`);
    },
  });
  return multer({
    storage,
    fileFilter: (_req, file, cb) => {
      const extension = resolveTypedExtension(file, extensions);
      if (extension) {
        file.resolvedExtension = extension;
        return cb(null, true);
      }
      return cb(
        Object.assign(
          new Error('Unsupported file type. Only PDF, JPG, PNG, and WebP documents are allowed.'),
          { code: 'INVALID_FILE_TYPE' }
        ),
        false
      );
    },
    limits: { fileSize: maxBytes },
  });
};

export const ANNOUNCEMENT_ATTACHMENT_EXTENSIONS = Object.freeze({
  ...IMAGE_EXTENSIONS,
  ...COMMUNITY_DOCUMENT_EXTENSIONS,
});

export const uploadAnnouncementAttachmentFile = (folderName = 'announcements') =>
  uploadTypedFile(folderName, ANNOUNCEMENT_ATTACHMENT_EXTENSIONS, 25 * 1024 * 1024);

export const uploadProviderDocument = (folderName = 'provider-documents') =>
  uploadTypedFile(folderName, ANNOUNCEMENT_ATTACHMENT_EXTENSIONS, 25 * 1024 * 1024);

export const uploadSocietyDocument = (folderName = 'society') =>
  uploadTypedFile(folderName, COMMUNITY_DOCUMENT_EXTENSIONS, 25 * 1024 * 1024);

export const uploadCommunityDocument = (folderName = 'community') =>
  uploadTypedFile(folderName, COMMUNITY_DOCUMENT_EXTENSIONS, 20 * 1024 * 1024);

export const uploadCommunityMedia = (folderName = 'community') =>
  uploadTypedFile(folderName, COMMUNITY_MEDIA_EXTENSIONS, 100 * 1024 * 1024);

export const uploadProductVideo = (folderName = 'business_products') =>
  uploadTypedFile(folderName, {
    'video/mp4': '.mp4',
    'video/quicktime': '.mov',
    'video/webm': '.webm',
  }, 50 * 1024 * 1024);

export const getMediaUrl = (req, fileOrFolder, folderOrFilename = 'general') =>
  getImageUrl(req, fileOrFolder, folderOrFilename);

/**
 * Helper to get the full URL of the uploaded image.
 * 
 * Future AWS S3 Migration:
 * When you shift to AWS, just change this function to return the S3 URL 
 * (which might be directly available in `file.location` using multer-s3).
 */
export const getImageUrl = (req, fileOrFolder, folderOrFilename = 'general') => {
  if (!fileOrFolder) return null;
  
  // If called as getImageUrl(req, 'event', 'filename.jpg') or getImageUrl(req, 'event', file.filename)
  if (typeof fileOrFolder === 'string') {
    const folder = safeFolder(fileOrFolder);
    const filename = typeof folderOrFilename === 'object' && folderOrFilename?.filename 
      ? folderOrFilename.filename 
      : folderOrFilename;
    return `${env.publicMediaOrigin}/uploads/${folder}/${filename}`;
  }
  
  // Standard call: getImageUrl(req, file, 'folder')
  const folder = safeFolder(folderOrFilename);
  return `${env.publicMediaOrigin}/uploads/${folder}/${fileOrFolder.filename}`;
};

export const removeLocalUpload = async (fileUrl) => {
  if (!fileUrl) return false;

  let pathname;
  try {
    const mediaOrigin = new URL(env.publicMediaOrigin);
    const url = new URL(fileUrl, env.publicMediaOrigin);
    if (url.origin !== mediaOrigin.origin || !url.pathname.startsWith('/uploads/')) return false;
    pathname = decodeURIComponent(url.pathname.slice('/uploads/'.length));
  } catch {
    return false;
  }

  const uploadsRoot = path.resolve(env.uploadsPath);
  const candidate = path.resolve(uploadsRoot, pathname);
  if (candidate === uploadsRoot || !candidate.startsWith(`${uploadsRoot}${path.sep}`)) return false;

  try {
    await fs.promises.unlink(candidate);
    return true;
  } catch (error) {
    if (error.code === 'ENOENT') return false;
    throw error;
  }
};
