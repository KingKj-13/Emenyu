const fs = require('fs');
const path = require('path');

const FAILED_FILES = [
  "veuve_clicquot_rose.jpg",
  "vilafonte_series_c.jpg",
  "vilafonte_series_m.jpg",
  "wagyu_chuckeye_350g.jpg",
  "wagyu_denver_350g.jpg",
  "wagyu_fillet_300g.jpg",
  "wagyu_ribeye_300g.jpg",
  "wagyu_rump_350g.jpg",
  "wagyu_sirloin_300g.jpg",
  "warwick_the_first_lady.jpg",
  "warwick_three_cape_ladies.jpg",
  "warwick_trilogy.jpg",
  "water_250ml_la_vie.jpg",
  "water_750ml_la_vie_trumps.jpg",
  "watermelon_gin_bull.jpg",
  "whitley_neill_original.jpg",
  "windhoek.jpg",
  "woodstock_original.jpg",
  "woodstock_tangerine.jpg",
  "zonnebloem_202.jpg",
  "zonnebloem_223.jpg",
  "zonnebloem_blanc_de_blanc.jpg"
];

const SOURCE_DIR = 'D:\\Projects\\Emenyu\\Sites\\Trump\\Images';
const TEMP_DIR = 'D:\\Projects\\Emenyu\\scripts\\temp_failed_images';

if (!fs.existsSync(TEMP_DIR)) {
  fs.mkdirSync(TEMP_DIR);
}

for (const f of FAILED_FILES) {
  try {
    fs.copyFileSync(path.join(SOURCE_DIR, f), path.join(TEMP_DIR, f));
  } catch (e) {
    console.error(`Error copying ${f}: ${e.message}`);
  }
}

console.log(`Copied ${FAILED_FILES.length} files to temp directory.`);
