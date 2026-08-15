const fs = require('fs');
const path = require('path');
const images = [
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

let sum = 0;
for(let img of images) {
  try {
    sum += fs.statSync(path.join('D:\\Projects\\Emenyu\\Sites\\Trump\\Images', img)).size;
  } catch(e) {}
}
console.log((sum / 1024 / 1024).toFixed(2) + ' MB');
