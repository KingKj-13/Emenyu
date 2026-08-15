const path = require('path');
const PROJECT_ROOT = '/var/www/mysite/Emenyu';
process.env.DATABASE_URL = 'postgresql://postgres:emenyu123@127.0.0.1:5432/emenyu';
const { PrismaClient } = require(path.join(PROJECT_ROOT, 'node_modules', '@prisma', 'client'));
const p = new PrismaClient();

async function main() {
  const items = await p.menuItem.findMany({
    where: { restaurantId: 'trump' },
    select: { id: true, name: true, normalizedName: true, imagePath: true },
    orderBy: { id: 'asc' }
  });
  
  console.log(JSON.stringify(items));
  await p.$disconnect();
}

main().catch(e => { console.error(e); process.exit(1); });
