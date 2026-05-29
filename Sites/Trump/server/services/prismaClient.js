// Shared Prisma client singleton for the waiter-AI services.
// Mirrors the lazy-init pattern already used in analyticsController/waiterController
// but avoids each new service opening its own connection pool.
const { PrismaClient } = require('@prisma/client');

let prisma = null;

function getPrisma() {
  if (!prisma) {
    prisma = new PrismaClient();
  }
  return prisma;
}

module.exports = { getPrisma };
