const multer = require('multer');
const { createCsvOrderImportService } = require('../services/csvOrderImportService');

function isCsvUpload(file) {
  const mimeType = String(file.mimetype || '').toLowerCase();
  const isCsvName = /\.csv$/i.test(file.originalname || '');
  const isCsvMime = ['text/csv', 'application/vnd.ms-excel', 'application/csv', 'text/plain'].includes(mimeType);
  return isCsvName || isCsvMime;
}

function createOrderImportController({ fileService, logger = null } = {}) {
  const importService = createCsvOrderImportService({ fileService, logger });

  const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 2 * 1024 * 1024, files: 1 },
    fileFilter(req, file, callback) {
      if (!isCsvUpload(file)) {
        const error = new Error('Only .csv files are accepted');
        error.statusCode = 400;
        return callback(error);
      }
      return callback(null, true);
    },
  });

  return {
    middleware: upload.single('file'),

    async importOrders(req, res) {
      if (!req.file) {
        return res.status(400).json({ error: 'No CSV file uploaded' });
      }
      try {
        const text = req.file.buffer.toString('utf-8');
        const result = await importService.importCsv(text);
        return res.json(result);
      } catch (error) {
        logger?.error?.('csv_order_import_failed', { error: error.message });
        return res.status(500).json({ error: 'Import failed', detail: error.message });
      }
    },
  };
}

module.exports = { createOrderImportController };
