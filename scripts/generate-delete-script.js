const fs = require('fs');
const path = require('path');

const localImagesDir = 'D:\\Projects\\Emenyu\\Sites\\Trump\\Images';
const newFiles = new Set(fs.readdirSync(localImagesDir).map(f => path.basename(f)));

const scriptContent = `
const fs = require('fs');
const path = require('path');
const NEW_FILES = new Set(${JSON.stringify(Array.from(newFiles))});
const IMAGES_DIR = '/var/www/mysite/Emenyu/Trump/Images';
const files = fs.readdirSync(IMAGES_DIR);
let deleted = 0;
for (const f of files) {
  if (NEW_FILES.has(f)) {
    fs.unlinkSync(path.join(IMAGES_DIR, f));
    deleted++;
  }
}
console.log('Deleted ' + deleted + ' new files from server to free up space.');
`;

fs.writeFileSync('D:\\Projects\\Emenyu\\scripts\\delete-all-new.js', scriptContent);
console.log('Script generated');
