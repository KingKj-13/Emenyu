const multer = require('multer');
const { createCsvOrderImportService } = require('../services/csvOrderImportService');

const XLSX_MIME_TYPES = new Set([
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', // .xlsx
  'application/vnd.ms-excel', // legacy .xls (also sometimes sent for .csv — extension wins below)
]);
const CSV_MIME_TYPES = new Set(['text/csv', 'application/csv', 'text/plain']);

/** Extension decides first (most reliable across browsers); mimetype is the fallback. */
function detectFileType(file) {
  const name = String(file.originalname || '').toLowerCase();
  if (/\.(xlsx|xls)$/.test(name)) return 'xlsx';
  if (/\.csv$/.test(name)) return 'csv';
  const mimeType = String(file.mimetype || '').toLowerCase();
  if (XLSX_MIME_TYPES.has(mimeType)) return 'xlsx';
  if (CSV_MIME_TYPES.has(mimeType)) return 'csv';
  return null;
}

function createOrderImportController({ fileService, logger = null } = {}) {
  const importService = createCsvOrderImportService({ fileService, logger });

  const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 5 * 1024 * 1024, files: 1 },
    fileFilter(req, file, callback) {
      if (!detectFileType(file)) {
        const error = new Error('Only .csv, .xlsx or .xls files are accepted');
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
        return res.status(400).json({ error: 'No file uploaded' });
      }
      const type = detectFileType(req.file);
      try {
        const result = type === 'xlsx'
          ? await importService.importXlsx(req.file.buffer)
          : await importService.importCsv(req.file.buffer.toString('utf-8'));
        return res.json(result);
      } catch (error) {
        logger?.error?.('order_import_failed', { error: error.message, type });
        return res.status(500).json({ error: 'Import failed', detail: error.message });
      }
    },
  };
}

module.exports = { createOrderImportController };
