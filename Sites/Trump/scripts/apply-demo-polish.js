const path = require('path');

const dotenv = require('dotenv');

const { createConfig } = require('../server/utils/helpers');
const { createLogger } = require('../server/utils/logger');
const { AccountService } = require('../server/services/accountService');

dotenv.config({ path: path.resolve(__dirname, '..', '..', '..', '.env'), quiet: true });
dotenv.config({ path: path.resolve(__dirname, '..', '.env'), quiet: true });

const DRINK_TERMS = [
  'wine', 'champagne', 'sparkling', 'bubbles', 'cocktail', 'mocktail', 'beverage',
  'drink', 'beer', 'cider', 'draught', 'spirit', 'liqueur', 'aperitif', 'digestif',
  'coffee', 'tea', 'lemonade', 'water', 'whisky', 'whiskey', 'brandy', 'gin',
  'vodka', 'rum', 'tequila', 'sauvignon', 'merlot', 'chardonnay', 'cabernet',
  'pinotage', 'shiraz', 'blanc', 'rose', 'rosé', 'malt'
];

const EXTRA_DRINK_TERMS = [
  'rose wine', 'soft', 'cappuccino', 'latte', 'espresso', 'red bull',
  'cocktails', 'mocktails', 'beverages', 'wines', 'beers', 'ciders', 'spirits', 'liqueurs', 'tonic',
  'juice', 'juices', 'shake', 'shakes', 'cordial', 'cordials', 'tisers'
];

const DRINK_IMAGES = [
  ['margarita', 'Images/Margarita.jpg'],
  ['mojito', 'Images/Mojito.jpg'],
  ['cosmopolitan', 'Images/Cosmopolitan.jpg'],
  ['negroni', 'Images/Negroni.jpg'],
  ['old fashioned', 'Images/Old Fashioned.jpg'],
  ['whiskey sour', 'Images/Whiskey Sour.jpeg'],
  ['aperol spritz', 'Images/Aperol Spritz (SA sparkling alternative).jpeg'],
  ['espresso martini', 'Images/Espresso Martini.jpg'],
  ['long island', 'Images/Long Island Iced Tea.jpg'],
  ['champagne', 'Images/Simonsig Kaapse Vonkel Brut (Cap Classique).jpg'],
  ['sparkling', 'Images/Simonsig Kaapse Vonkel Brut (Cap Classique).jpg'],
  ['bubbles', 'Images/Simonsig Kaapse Vonkel Brut (Cap Classique).jpg'],
  ['chardonnay', 'Images/Boschendal 1685 Chardonnay.jpg'],
  ['sauvignon', 'Images/Two Oceans Sauvignon Blanc.jpg'],
  ['pinotage', 'Images/Fairview Pinotage.jpeg'],
  ['cabernet', 'Images/Nederburg The Winemasters Cabernet Sauvignon.jpg'],
  ['merlot', 'Images/Porcupine Ridge Shiraz.jpg'],
  ['shiraz', 'Images/Porcupine Ridge Shiraz.jpg'],
  ['wine', 'Images/Porcupine Ridge Shiraz.jpg'],
  ['beer', 'Images/Heineken (330ml).jpg'],
  ['lager', 'Images/Heineken (330ml).jpg'],
  ['draught', 'Images/Heineken (330ml).jpg'],
  ['cider', 'Images/Savanna Dry (330ml).jpg'],
  ['whiskey', 'Images/Jameson Irish Whiskey 750ml.jpg'],
  ['whisky', 'Images/Johnnie Walker Black Label 12yo 750ml.jpeg'],
  ['espresso', 'Images/Espresso (Single).jpg'],
  ['cappuccino', 'Images/Cappuccino.jpg'],
  ['latte', 'Images/Cafe Latte.jpg'],
  ['coffee', 'Images/Cappuccino.jpg'],
  ['tea', 'Images/Rooibos.jpg'],
  ['water', 'Images/Bottled Water.jpg'],
  ['red bull', 'Images/Red Bull Energy Drink.jpg'],
  ['lemonade', 'Images/Red Bull Energy Drink.jpg']
];

const FOOD_IMAGES = [
  ['tomahawk', 'Images/Tomahawk.jpg'],
  ['ribeye', 'Images/Rump Steak.jpg'],
  ['beef fillet', 'Images/Beef fillet.jpg'],
  ['fillet', 'Images/Beef fillet.jpg'],
  ['rump', 'Images/Rump Steak.jpg'],
  ['sirloin', 'Images/Rump Steak.jpg'],
  ['t-bone', 'Images/Tomahawk.jpg'],
  ['calamari', 'Images/Calamari.jpeg'],
  ['prawn', 'Images/Butter-garlic-prawns.jpg'],
  ['oyster', 'Images/Oyster.jpg'],
  ['mussel', 'Images/Mussels.jpg'],
  ['fish', 'Images/Fish & Chips.jpg'],
  ['sole', 'Images/East Coast Sole.jpg'],
  ['kingklip', 'Images/Kingklip.png'],
  ['pork chop', 'Images/Crispy Pork Chops.jpg'],
  ['lamb chop', 'Images/Crispy Lamb Chops.jpg'],
  ['lamb', 'Images/Crispy Lamb Chops.jpg'],
  ['burger', 'Images/Bifteki Burger.jpg'],
  ['pasta', 'Images/Beef Fillet Pasta.jpg'],
  ['chicken', 'Images/Chicken Pasta.jpg'],
  ['salad', 'Images/Veg Meze Platter.jpg'],
  ['vegetarian', 'Images/Veg Meze Platter.jpg'],
  ['halloumi', 'Images/Halloumi.jpg'],
  ['mushroom', 'Images/Black Mushroom.jpg'],
  ['falafel', 'Images/Falafel.jpg'],
  ['dolmades', 'Images/Dolmades.jpg'],
  ['zucchini', 'Images/Zucchini Fries.jpg'],
  ['croquette', 'Images/Cheese Croquettes.jpg'],
  ['baklava', 'Images/Baklava Cheese Cake.jpg'],
  ['cheesecake', 'Images/Cheese Cake.jpg'],
  ['cake', 'Images/Cheese Cake.jpg'],
  ['ice cream', 'Images/Ice Cream & Bar-One Sauce.png'],
  ['dessert', 'Images/Cheese Cake.jpg']
];

function loadPrismaClient() {
  const projectRoot = path.resolve(__dirname, '..', '..', '..');
  const candidates = [
    path.join(projectRoot, 'node_modules', '@prisma', 'client'),
    '@prisma/client'
  ];

  for (const candidate of candidates) {
    try {
      return require(candidate).PrismaClient;
    } catch {}
  }

  return null;
}

function textFor(item) {
  return [
    item.name,
    item.description,
    item.sourceTitle,
    item.category?.title
  ].filter(Boolean).join(' ').toLowerCase();
}

function classificationTextFor(item) {
  return [
    item.name,
    item.sourceTitle,
    item.category?.title,
    item.category?.parent?.title
  ].filter(Boolean).join(' ').toLowerCase();
}

function hasTerm(text, term) {
  const cleanText = text.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  const cleanTerm = term.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  const escaped = cleanTerm.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/\s+/g, '[^a-z0-9]+');
  return new RegExp(`(^|[^a-z0-9])${escaped}([^a-z0-9]|$)`, 'i').test(cleanText);
}

function isDrink(item) {
  const text = classificationTextFor(item);
  return [...DRINK_TERMS, ...EXTRA_DRINK_TERMS].some(term => hasTerm(text, term));
}

function drinkImage(item) {
  const text = textFor(item);
  for (const [term, imagePath] of DRINK_IMAGES) {
    if (text.includes(term)) return imagePath;
  }
  return 'Images/Mojito.jpg';
}

function foodImage(item) {
  const text = textFor(item);
  for (const [term, imagePath] of FOOD_IMAGES) {
    if (text.includes(term)) return imagePath;
  }
  return 'Images/Tomahawk.jpg';
}

function demoVideo(item) {
  const text = textFor(item);
  const classificationText = classificationTextFor(item);
  if (/(dessert|cake|ice cream|cheesecake|sweet|baklava|fondant)/.test(classificationText)) {
    return 'Video/demo/dessert.mp4';
  }
  if (/(pasta|spaghetti|linguine|bolognese)/.test(text)) {
    return 'Video/demo/pasta.mp4';
  }
  if (/(seafood|prawn|shrimp|oyster|mussel|fish|salmon|kingklip|sole|calamari|squid)/.test(text)) {
    return 'Video/demo/seafood.mp4';
  }
  if (/(steak|beef|fillet|sirloin|rump|rib|burger|lamb|pork|chop|grill|tomahawk|venison|game|oxtail)/.test(text)) {
    return 'Video/demo/steak-grill.mp4';
  }
  if (/(starter|meze|tapas|halloumi|falafel|mushroom|vegetarian|side|salad|zucchini|brinjal|croquette|phyllo|spanakopita|tiropita|dolmades)/.test(text)) {
    return 'Video/demo/seafood.mp4';
  }
  return 'Video/demo/steak-grill.mp4';
}

async function main() {
  const config = createConfig(path.resolve(__dirname, '..'));
  const logger = createLogger(config);
  const accountService = new AccountService(config, { logger });
  await accountService.ensureReady();

  const PrismaClient = loadPrismaClient();
  if (!PrismaClient || !process.env.DATABASE_URL) {
    console.log('Prisma unavailable; demo accounts were refreshed in JSON only.');
    return;
  }

  const prisma = new PrismaClient();
  try {
    const items = await prisma.menuItem.findMany({
      where: { restaurantId: config.restaurantId },
      include: {
        category: {
          select: {
            title: true,
            parent: { select: { title: true } }
          }
        }
      }
    });

    let drinks = 0;
    let videos = 0;
    for (const item of items) {
      if (isDrink(item)) {
        await prisma.menuItem.update({
          where: { id: item.id },
          data: {
            imagePath: drinkImage(item),
            videoPath: '',
            youtubeId: '',
            videoVisible: false,
            imageVisible: true
          }
        });
        drinks += 1;
        continue;
      }

      const videoPath = demoVideo(item);
      if (videoPath) {
        await prisma.menuItem.update({
          where: { id: item.id },
          data: {
            imagePath: foodImage(item),
            videoPath,
            youtubeId: '',
            videoVisible: true,
            imageVisible: true
          }
        });
        videos += 1;
      }
    }

    console.log(`Demo accounts refreshed. Drink items cleaned: ${drinks}. Food/dessert videos assigned: ${videos}.`);
  } finally {
    await prisma.$disconnect();
    await accountService.close();
  }
}

main().catch(error => {
  console.error(error);
  process.exit(1);
});
