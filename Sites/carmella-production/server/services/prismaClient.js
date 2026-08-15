// Shared Prisma client singleton for all server services/controllers.
//
// It loads the GENERATED client by explicit path first
// (PROJECT_ROOT/node_modules/@prisma/client) before falling back to bare module
// resolution. This makes resolution deterministic regardless of node_modules
// layout: a Trump-local, un-generated `@prisma/client` stub must never shadow the
// real generated client (the "local stub gotcha"). Mirrors prismaOrderService's
// loader. Using one singleton also avoids each service opening its own pool.
const path = require('path');

// server/services → up two levels = carmella-production's own root, which
// holds its own generated client in its own node_modules (this tenant is a
// fully independent deployable, not sharing Trump's node_modules).
const PROJECT_ROOT = path.resolve(__dirname, '..', '..');

function loadPrismaClient() {
  const candidates = [
    path.join(PROJECT_ROOT, 'node_modules', '@prisma', 'client'),
    '@prisma/client'
  ];
  for (const candidate of candidates) {
    try {
      const mod = require(candidate);
      if (mod && mod.PrismaClient) return mod.PrismaClient;
    } catch {
      // Try the next resolution path.
    }
  }
  return null;
}

let prisma = null;

function getPrisma() {
  if (!prisma) {
    const PrismaClient = loadPrismaClient();
    if (!PrismaClient) {
      throw new Error('[prisma] @prisma/client is not available/generated — run `prisma generate`.');
    }
    prisma = new PrismaClient();
  }
  return prisma;
}

module.exports = { getPrisma, loadPrismaClient };
