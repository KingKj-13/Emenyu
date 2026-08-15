#!/usr/bin/env node
'use strict';
// Bug C-2 (demo validation report Part 7/10): the Night menu (golden day-part)
// exposed no mains/starters, so a dinner was not orderable at night. Adds the
// missing chapters to golden's leadChapters. Safe to re-run (idempotent).
const path = require('path');
const dotenv = require('dotenv');
dotenv.config({ path: path.resolve(__dirname, '..', '.env'), quiet: true });
const { getPrisma } = require('../../Trump/server/services/prismaClient');

async function main() {
  const prisma = getPrisma();
  const golden = await prisma.dayPart.findFirst({ where: { restaurantId: 'carmella', slug: 'golden' } });
  if (!golden) throw new Error('golden day-part not found for carmella');

  const current = Array.isArray(golden.leadChapters) ? golden.leadChapters : [];
  const required = ['global-table', 'companions', 'interludes'];
  const next = [...new Set([...current, ...required])];

  console.log('current:', current);
  console.log('next:   ', next);

  await prisma.dayPart.update({
    where: { id: golden.id },
    data: { leadChapters: next }
  });

  console.log('updated golden.leadChapters');
  await prisma.$disconnect();
}

main().catch(e => { console.error(e); process.exit(1); });
