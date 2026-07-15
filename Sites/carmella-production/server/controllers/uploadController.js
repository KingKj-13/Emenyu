const multer = require('multer');
const fs = require('fs');
const path = require('path');

const MIME_EXTENSION_MAP = new Map([
  ['image/jpeg', new Set(['.jpg', '.jpeg'])],
  ['image/png', new Set(['.png'])],
  ['image/webp', new Set(['.webp'])],
  ['image/gif', new Set(['.gif'])]
]);

// Optimized-output settings — mirrors mediaEnrichmentService (sharp + webp ~q80)
// and scripts/optimize-images-oneoff.js so all menu media meets the same bar.
const FULL_WIDTH = 1600;
const THUMB_WIDTH = 300;
const WEBP_QUALITY = 80;
const THUMB_QUALITY = 75;

function loadSharp() {
  try {
    return require('sharp');
  } catch {
    return null;
  }
}

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

// Animated GIFs are passed through raw (re-encoding would drop frames); every
// other image is resized + converted to WebP with a 300px card thumbnail.
function isOptimizableImage(mimeType) {
  return ['image/jpeg', 'image/png', 'image/webp'].includes(String(mimeType || '').toLowerCase());
}

function createUploadController(config, { logger = null } = {}) {
  const sharp = loadSharp();
  const thumbnailsDir = path.join(config.directories.uploads, 'thumbnails');
  fs.mkdirSync(thumbnailsDir, { recursive: true });

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

  async function optimizeImage(file) {
    const rawPath = file.path;
    const stem = path.basename(file.filename, path.extname(file.filename));
    const webpName = `${stem}.webp`;
    const webpPath = path.join(config.directories.uploads, webpName);
    const thumbPath = path.join(thumbnailsDir, webpName);

    // Write to .tmp then rename so a half-written file is never served, and so
    // a .webp upload never streams into its own read path.
    const base = sharp(rawPath, { failOn: 'none' }).rotate();
    await base
      .clone()
      .resize({ width: FULL_WIDTH, withoutEnlargement: true })
      .webp({ quality: WEBP_QUALITY })
      .toFile(`${webpPath}.tmp`);
    await base
      .clone()
      .resize({ width: THUMB_WIDTH, withoutEnlargement: true })
      .webp({ quality: THUMB_QUALITY })
      .toFile(`${thumbPath}.tmp`);

    for (const out of [webpPath, thumbPath]) {
      await fs.promises.rm(out, { force: true });
      await fs.promises.rename(`${out}.tmp`, out);
    }

    if (path.resolve(rawPath) !== path.resolve(webpPath)) {
      await fs.promises.rm(rawPath, { force: true }).catch(() => {});
    }

    return webpName;
  }

  return {
    middleware: upload.single('mediaFile'),

    async uploadMedia(req, res) {
      if (!req.file) {
        return res.status(400).json({ error: 'No file uploaded' });
      }

      let filename = req.file.filename;
      let mimeType = req.file.mimetype;

      if (isOptimizableImage(req.file.mimetype)) {
        if (sharp) {
          try {
            filename = await optimizeImage(req.file);
            mimeType = 'image/webp';
          } catch (error) {
            // Never fail the upload over optimization — serve the raw file.
            logger?.warn?.('upload_image_optimize_failed', { file: req.file.filename, error: error.message });
          }
        } else {
          logger?.warn?.('upload_image_optimize_skipped', { file: req.file.filename, reason: 'sharp unavailable' });
        }
      }

      return res.json({
        filePath: `${config.publicBasePath}/uploads/${filename}`,
        type: mimeType
      });
    },

    // STEP 6 — admin can delete an uploaded photo (and its thumbnail, if any).
    async deleteMedia(req, res) {
      const filename = path.basename(String(req.params.filename || ''));
      if (!filename) {
        return res.status(400).json({ error: 'filename is required' });
      }
      const targets = [
        path.join(config.directories.uploads, filename),
        path.join(thumbnailsDir, filename)
      ];
      await Promise.all(targets.map(target => fs.promises.rm(target, { force: true }).catch(() => {})));
      res.json({ ok: true });
    }
  };
}

module.exports = {
  createUploadController
};
