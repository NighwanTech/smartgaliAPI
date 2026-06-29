import multer from 'multer';
import path from 'path';
import fs from 'fs';

/**
 * Global Image Upload Utility
 * This handles saving files locally in a structured folder format (e.g. uploads/profile/)
 * 
 * Future AWS S3 Migration:
 * When moving to AWS S3, you can replace `multer.diskStorage` below with `multer-s3`.
 * This ensures you don't need to change any of the routes using this middleware.
 */

export const uploadImage = (folderName = 'general') => {
  const storage = multer.diskStorage({
    destination: (req, file, cb) => {
      // The uploads folder is statically served in app.js
      const uploadPath = path.join(process.cwd(), 'uploads', folderName);
      
      // Automatically create the folder (e.g., uploads/profile) if it doesn't exist
      if (!fs.existsSync(uploadPath)) {
        fs.mkdirSync(uploadPath, { recursive: true });
      }
      
      cb(null, uploadPath);
    },
    filename: (req, file, cb) => {
      // Generate a unique filename: fieldname-timestamp-random.ext
      const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
      const ext = path.extname(file.originalname);
      cb(null, `${file.fieldname}-${uniqueSuffix}${ext}`);
    }
  });

  const fileFilter = (req, file, cb) => {
    // Only accept image files
    if (file.mimetype.startsWith('image/')) {
      cb(null, true);
    } else {
      cb(new Error('Only image files are allowed!'), false);
    }
  };

  return multer({
    storage,
    fileFilter,
    limits: { fileSize: 5 * 1024 * 1024 } // 5 MB file size limit
  });
};

/**
 * Helper to get the full URL of the uploaded image.
 * 
 * Future AWS S3 Migration:
 * When you shift to AWS, just change this function to return the S3 URL 
 * (which might be directly available in `file.location` using multer-s3).
 */
export const getImageUrl = (req, file, folderName = 'general') => {
  if (!file) return null;
  
  // For AWS S3: return file.location;
  
  // For Local Storage:
  const baseUrl = `${req.protocol}://${req.get('host')}`;
  return `${baseUrl}/uploads/${folderName}/${file.filename}`;
};
