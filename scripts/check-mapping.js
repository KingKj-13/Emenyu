const path = require('path');
const PROJECT_ROOT = '/var/www/mysite/Emenyu';
process.env.DATABASE_URL = 'postgresql://postgres:emenyu123@127.0.0.1:5432/emenyu';
const { PrismaClient } = require(path.join(PROJECT_ROOT, 'node_modules', '@prisma', 'client'));
const p = new PrismaClient();

async function main() {
  const items = await p.menuItem.findMany({
    where: { 
      name: { in: ['FRIED HALLOUMI FINGERS', 'SMALL GREEK SALAD', 'TEMPURA CHICKEN'] }
    },
    select: { name: true, imagePath: true }
  });
  console.log(items);
  await p.$disconnect();
}
main().catch(e => console.error(e));
