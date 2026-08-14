// Bulk historical-order import for the admin Reports tab. Lets an owner backfill
// real past order data (from a POS export, a spreadsheet of takings, etc.) so
// "most ordered dishes/drinks" and revenue reports read as a real restaurant
// instead of empty, without waiting for the CSV column names Prisma happens to
// use — headers are matched loosely against common aliases (item/dish/name,
// qty/quantity, ...).
//
// Each CSV row becomes one OrderItem; rows are grouped into one Order per
// (table, order id) pair so a multi-item receipt still reports as a single
// order rather than one per line. Writes go straight through
// prismaOrderService.saveOrder with kind 'history', the same path
// archiveTable() uses to settle a real order — so an imported row is
// indistinguishable from a real completed sale to every existing analytics
// query. Filenames are a hash of the group's own identity, so re-uploading the
// same CSV twice updates the same rows instead of doubling them.
const crypto = require('crypto');
const { getPrisma } = require('./prismaClient');
const { getCanonicalTableId, normalizeName } = require('../utils/helpers');

const MAX_ROWS = 5000;
const DEFAULT_TABLE = 'csv-import';

const HEADER_ALIASES = {
  date: ['date', 'timestamp', 'datetime', 'time'],
  item: ['item', 'dish', 'name', 'product', 'menuitem'],
  quantity: ['quantity', 'qty', 'count'],
  price: ['price', 'unitprice'],
  table: ['table', 'tableid', 'tablenumber'],
  orderid: ['orderid', 'receipt', 'ticket', 'bill'],
  waiter: ['waiter', 'waitername', 'server'],
};

/** Minimal RFC4180 parser — handles quoted fields, embedded commas/quotes, CRLF. */
function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = '';
  let inQuotes = false;
  const endField = () => { row.push(field); field = ''; };
  const endRow = () => { endField(); rows.push(row); row = []; };

  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') { field += '"'; i += 1; } else { inQuotes = false; }
      } else {
        field += c;
      }
      continue;
    }
    if (c === '"') { inQuotes = true; continue; }
    if (c === ',') { endField(); continue; }
    if (c === '\r') continue;
    if (c === '\n') { endRow(); continue; }
    field += c;
  }
  if (field !== '' || row.length > 0) endRow();

  return rows.filter(r => r.some(cell => String(cell).trim() !== ''));
}

function normalizeHeader(cell) {
  return String(cell || '').trim().toLowerCase().replace(/[^a-z0-9]/g, '');
}

function buildColumnMap(headerRow) {
  const columnMap = {};
  headerRow.forEach((cell, index) => {
    const key = normalizeHeader(cell);
    for (const [canonical, aliases] of Object.entries(HEADER_ALIASES)) {
      if (columnMap[canonical] === undefined && aliases.includes(key)) {
        columnMap[canonical] = index;
      }
    }
  });
  return columnMap;
}

function parseDate(value) {
  if (!value) return null;
  const d = new Date(String(value).trim());
  return Number.isNaN(d.getTime()) ? null : d;
}

function groupKey(table, orderId, rowIndex) {
  return orderId ? `${table}|order:${orderId}` : `${table}|row:${rowIndex}`;
}

function createCsvOrderImportService({ fileService, logger = null } = {}) {
  async function resolveMissingPrices(names, restaurantId) {
    const priceByName = new Map();
    if (names.length === 0) return priceByName;
    try {
      const db = getPrisma();
      const items = await db.menuItem.findMany({
        where: { restaurantId },
        select: { name: true, price: true },
      });
      for (const item of items) priceByName.set(normalizeName(item.name), Number(item.price) || 0);
    } catch (error) {
      logger?.warn?.('csv_import_price_lookup_failed', { error: error.message });
    }
    return priceByName;
  }

  async function importCsv(text) {
    const restaurantId = fileService?.prismaOrder?.restaurantId || 'trump';
    const rows = parseCsv(text);
    if (rows.length < 2) {
      return {
        ordersCreated: 0, itemsImported: 0, skippedRows: 0,
        errors: ['CSV needs a header row and at least one data row.'],
      };
    }

    const columnMap = buildColumnMap(rows[0]);
    if (columnMap.item === undefined) {
      return {
        ordersCreated: 0, itemsImported: 0, skippedRows: 0,
        errors: ['No "item" (or "dish"/"name") column found in the header row.'],
      };
    }

    const dataRows = rows.slice(1, 1 + MAX_ROWS);
    const truncated = rows.length - 1 > MAX_ROWS;
    const errors = [];
    let skippedRows = 0;

    const parsed = [];
    const namesNeedingPrice = new Set();
    dataRows.forEach((cells, i) => {
      const rowNum = i + 2; // 1-based, +1 for the header row
      const itemName = String(cells[columnMap.item] ?? '').trim();
      if (!itemName) { skippedRows += 1; return; }

      const quantityRaw = columnMap.quantity !== undefined ? cells[columnMap.quantity] : undefined;
      const quantity = Math.max(1, Math.round(Number(quantityRaw) || 1));

      const priceRaw = columnMap.price !== undefined ? cells[columnMap.price] : undefined;
      const hasPrice = priceRaw !== undefined && String(priceRaw).trim() !== '';
      const price = hasPrice ? Number(priceRaw) : null;
      if (hasPrice && Number.isNaN(price)) {
        errors.push(`Row ${rowNum}: price "${priceRaw}" is not a number — using the menu price instead.`);
      }
      if (!hasPrice || Number.isNaN(price)) namesNeedingPrice.add(normalizeName(itemName));

      const dateCell = columnMap.date !== undefined ? cells[columnMap.date] : undefined;
      const date = dateCell !== undefined ? parseDate(dateCell) : null;
      if (dateCell !== undefined && dateCell !== '' && !date) {
        errors.push(`Row ${rowNum}: could not parse date "${dateCell}" — used today instead.`);
      }

      const tableCell = columnMap.table !== undefined ? String(cells[columnMap.table] || '').trim() : '';
      const table = tableCell ? getCanonicalTableId(tableCell) : DEFAULT_TABLE;
      const orderId = columnMap.orderid !== undefined ? String(cells[columnMap.orderid] || '').trim() : '';
      const waiter = columnMap.waiter !== undefined ? String(cells[columnMap.waiter] || '').trim() : '';

      parsed.push({
        rowIndex: i, itemName, quantity,
        price: hasPrice && !Number.isNaN(price) ? price : null,
        date: date || new Date(), table, orderId, waiter,
      });
    });

    const priceByName = await resolveMissingPrices([...namesNeedingPrice], restaurantId);

    const groups = new Map();
    for (const row of parsed) {
      const key = groupKey(row.table, row.orderId, row.rowIndex);
      let group = groups.get(key);
      if (!group) {
        group = { table: row.table, date: row.date, waiter: row.waiter, items: [] };
        groups.set(key, group);
      }
      const resolvedPrice = row.price !== null ? row.price : (priceByName.get(normalizeName(row.itemName)) || 0);
      group.items.push({ name: row.itemName, price: resolvedPrice, quantity: row.quantity });
    }

    let ordersCreated = 0;
    let itemsImported = 0;
    for (const [key, group] of groups) {
      const filename = `csv-import_${crypto.createHash('sha1').update(key).digest('hex').slice(0, 16)}.json`;
      const orderPayload = {
        table_number: group.table,
        waiterName: group.waiter,
        notes: 'Imported from CSV (historical order data)',
        timestamp: group.date.toISOString(),
        covers: 0,
        items: group.items,
      };
      const saved = await fileService.prismaOrder.saveOrder(orderPayload, group.table, filename, 'history');
      if (saved) {
        ordersCreated += 1;
        itemsImported += group.items.length;
      } else {
        errors.push(`Could not save the order for "${key}" — database unavailable.`);
      }
    }

    if (truncated) errors.push(`Only the first ${MAX_ROWS} data rows were imported; the rest of the file was skipped.`);

    return { ordersCreated, itemsImported, skippedRows, errors: errors.slice(0, 25) };
  }

  return { importCsv };
}

module.exports = { createCsvOrderImportService };
