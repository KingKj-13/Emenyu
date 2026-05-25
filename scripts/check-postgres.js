const path = require('path');

const dotenv = require('dotenv');
const postgres = require('postgres');

const { validatePrismaEnvironment } = require('./validate-prisma-env');

dotenv.config({ path: path.resolve(__dirname, '..', '.env'), quiet: true });

async function main() {
  validatePrismaEnvironment();
  const parsed = new URL(process.env.DATABASE_URL);

  if (parsed.protocol === 'prisma+postgres:') {
    console.log(JSON.stringify({
      status: 'skipped',
      database: 'prisma-postgres-managed-url',
      detail: 'Direct postgres client checks require a postgresql:// URL. Use npm run prisma:startup for Prisma validation with this managed URL.'
    }, null, 2));
    return;
  }

  const sql = postgres(process.env.DATABASE_URL, {
    max: 1,
    idle_timeout: 5,
    connect_timeout: Number(process.env.POSTGRES_CONNECT_TIMEOUT_SECONDS || 10)
  });

  try {
    const rows = await sql`select 1 as ok`;
    if (!rows || rows[0]?.ok !== 1) {
      throw new Error('PostgreSQL did not return the expected validation row');
    }

    console.log(JSON.stringify({ status: 'ok', database: 'connected' }, null, 2));
  } finally {
    await sql.end({ timeout: 5 });
  }
}

main().catch(error => {
  console.error(error.message || String(error));
  process.exit(1);
});
