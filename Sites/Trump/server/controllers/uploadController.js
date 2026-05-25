const multer = require('multer');
const path = require('path');

const MIME_EXTENSION_MAP = new Map([
  ['image/jpeg', new Set(['.jpg', '.jpeg'])],
  ['image/png', new Set(['.png'])],
  ['image/webp', new Set(['.webp'])],
  ['image/gif', new Set(['.gif'])],
  ['video/mp4', new Set(['.mp4'])],
  ['video/webm', new Set(['.webm'])]
]);

function safeUploadName(originalName = '') {
  const extension = path.extname(originalName).toLowerCase();
  const stem = path
    .basename(originalName, extension)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);

  return `${Date.now()}_${stem || 'upload'}${extension}`;
}

function isAllowedUpload(file, config) {
  const mimeType = String(file.mimetype || '').toLowerCase();
  const extension = path.extname(file.originalname || '').toLowerCase();
  const allowedForMime = MIME_EXTENSION_MAP.get(mimeType);

  if (!config.uploads.allowedMimeTypes.includes(mimeType)) {
    return false;
  }

  if (!extension || !config.uploads.allowedExtensions.includes(extension)) {
    return false;
  }

  return Boolean(allowedForMime && allowedForMime.has(extension));
}

function createUploadController(config) {
  const storage = multer.diskStorage({
    destination(req, file, callback) {
      callback(null, config.directories.uploads);
    },
    filename(req, file, callback) {
      callback(null, safeUploadName(file.originalname));
    }
  });

  const upload = multer({
    storage,
    limits: {
      fileSize: config.uploads.maxFileSizeBytes,
      files: 1
    },
    fileFilter(req, file, callback) {
      if (!isAllowedUpload(file, config)) {
        const error = new Error('Unsupported upload type or file extension');
        error.statusCode = 400;
        return callback(error);
      }

      return callback(null, true);
    }
  });

  return {
    middleware: upload.single('mediaFile'),

    uploadMedia(req, res) {
      if (!req.file) {
        return res.status(400).json({ error: 'No file uploaded' });
      }

      return res.json({
        filePath: `${config.publicBasePath}/uploads/${req.file.filename}`,
        type: req.file.mimetype
      });
    }
  };
}

module.exports = {
  createUploadController
};
