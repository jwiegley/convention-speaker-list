import multer from 'multer';
import path from 'path';
import { Request } from 'express';

// Configure multer for file uploads
const storage = multer.memoryStorage();

// File filter function
const csvFileFilter = (
  req: Request,
  file: Express.Multer.File,
  callback: multer.FileFilterCallback
) => {
  const ext = path.extname(file.originalname).toLowerCase();
  if (ext === '.csv' || file.mimetype === 'text/csv') {
    callback(null, true);
  } else {
    callback(new Error('Only CSV files are allowed'));
  }
};

// Create multer instance for CSV uploads
export const uploadCSV = multer({
  storage,
  fileFilter: csvFileFilter,
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB limit
  },
}).single('file');

// Error handler for multer
export const handleUploadError = (error: any) => {
  if (error instanceof multer.MulterError) {
    if (error.code === 'LIMIT_FILE_SIZE') {
      return 'File too large. Maximum size is 10MB.';
    }
    return `Upload error: ${error.message}`;
  }
  return error.message || 'Unknown upload error';
};