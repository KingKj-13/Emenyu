#!/usr/bin/env node
// CLI counterpart to the admin Reports tab's "Import order history (CSV)"
// button — runs the exact same csvOrderImportService the HTTP endpoint uses,
// so a large historical backfill (or an ops box with no browser session) can
// go straight through Node instead of a file-upload form.
//
// Usage: node scripts/import-order-history-csv.js <path-to-csv> [restaurantId]
const fs = require('fs');
const path = require('path');

const { PrismaOrderService } = require('../server/services/prismaOrderService');
const { createCsvOrderImportService } = require('../server/services/csvOrderImportService');

async function main() {
  const csvPath = process.argv[2];
  const restaurantId = process.argv[3] || 'trump';
  if (!csvPath) {
    console.error('Usage: node scripts/import-order-history-csv.js <path-to-csv> [restaurantId]');
    process.exit(1);
  }

  const text = fs.readFileSync(path.resolve(csvPath), 'utf-8');
  const prismaOrder = new PrismaOrderService({ restaurantId, logger: console });
  const importService = createCsvOrderImportService({ fileService: { prismaOrder }, logger: console });

  const result = await importService.importCsv(text);
  console.log(JSON.stringify(result, null, 2));
  await prismaOrder.close();
  process.exit(result.errors.length && result.ordersCreated === 0 ? 1 : 0);
}

main().catch(error => {
  console.error(error);
  process.exit(1);
});
