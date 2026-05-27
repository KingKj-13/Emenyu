import { BASE_PATH } from '../constants/api';
import type { MenuItem } from '../types/menu';

const KEYWORD_MAP: Record<string, string> = {
  tomahawk: 'Tomahawk.jpg',
  ribeye: 'Rump Steak.jpg',
  'beef fillet': 'Beef fillet.jpg',
  fillet: 'Beef fillet.jpg',
  rump: 'Rump Steak.jpg',
  sirloin: 'Rump Steak.jpg',
  't-bone': 'Tomahawk.jpg',
  calamari: 'Calamari.jpeg',
  prawn: 'Butter-garlic-prawns.jpg',
  oyster: 'Oyster.jpg',
  salmon: 'Kingklip.png',
  'pork chop': 'Crispy Pork Chops.jpg',
  'lamb chop': 'Crispy Lamb Chops.jpg',
  'lamb rack': 'Crispy Lamb Chops.jpg',
  cheesecake: 'Cheese Cake.jpg',
  baklava: 'Baklava Cheese Cake.jpg',
  chocolate: 'Ice Cream & Bar-One Sauce.png',
  margarita: 'Margarita.jpg',
  mojito: 'Mojito.jpg',
  'old fashioned': 'Old Fashioned.jpg',
  espresso: 'Espresso Martini.jpg',
  heineken: 'Heineken (330ml).jpg',
  burger: 'Bifteki Burger.jpg',
  sushi: 'Seafood Meze Platter.jpg',
  tempura: 'Prawn Katafi.jpg',
  salad: 'Veg Meze Platter.jpg',
  pasta: 'Beef Fillet Pasta.jpg',
  chicken: 'Chicken Pasta.jpg',
  oxtail: 'Beef Strips.jpg',
  ribs: 'Crispy Pork Chops.jpg',
};

const DRINK_IMAGE_MAP: Record<string, string> = {
  margarita: 'Margarita.jpg',
  mojito: 'Mojito.jpg',
  cosmopolitan: 'Cosmopolitan.jpg',
  negroni: 'Negroni.jpg',
  'old fashioned': 'Old Fashioned.jpg',
  'whiskey sour': 'Whiskey Sour.jpeg',
  'aperol spritz': 'Aperol Spritz (SA sparkling alternative).jpeg',
  'espresso martini': 'Espresso Martini.jpg',
  'long island': 'Long Island Iced Tea.jpg',
  champagne: 'Simonsig Kaapse Vonkel Brut (Cap Classique).jpg',
  sparkling: 'Simonsig Kaapse Vonkel Brut (Cap Classique).jpg',
  bubbles: 'Simonsig Kaapse Vonkel Brut (Cap Classique).jpg',
  chardonnay: 'Boschendal 1685 Chardonnay.jpg',
  sauvignon: 'Two Oceans Sauvignon Blanc.jpg',
  merlot: 'Porcupine Ridge Shiraz.jpg',
  shiraz: 'Porcupine Ridge Shiraz.jpg',
  pinotage: 'Fairview Pinotage.jpeg',
  cabernet: 'Nederburg The Winemasters Cabernet Sauvignon.jpg',
  wine: 'Porcupine Ridge Shiraz.jpg',
  beer: 'Heineken (330ml).jpg',
  lager: 'Heineken (330ml).jpg',
  cider: 'Savanna Dry (330ml).jpg',
  whiskey: "Jameson Irish Whiskey 750ml.jpg",
  whisky: "Johnnie Walker Black Label 12yo 750ml.jpeg",
  gin: "Ballantine's Finest 750ml.jpg",
  vodka: "Ballantine's Finest 750ml.jpg",
  rum: "Ballantine's Finest 750ml.jpg",
  tequila: "Ballantine's Finest 750ml.jpg",
  espresso: 'Espresso (Single).jpg',
  cappuccino: 'Cappuccino.jpg',
  latte: 'Cafe Latte.jpg',
  coffee: 'Cappuccino.jpg',
  tea: 'Rooibos.jpg',
  lemonade: 'Red Bull Energy Drink.jpg',
  water: 'Bottled Water.jpg',
  redbull: 'Red Bull Energy Drink.jpg',
  'red bull': 'Red Bull Energy Drink.jpg',
};

const CATEGORY_IMAGE_MAP: Record<string, string> = {
  dessert: 'Cheese Cake.jpg',
  cake: 'Cheese Cake.jpg',
  icecream: 'Ice Cream & Bar-One Sauce.png',
  ice: 'Ice Cream & Bar-One Sauce.png',
  steak: 'Tomahawk.jpg',
  beef: 'Beef fillet.jpg',
  burger: 'Bifteki Burger.jpg',
  lamb: 'Crispy Lamb Chops.jpg',
  pork: 'Crispy Pork Chops.jpg',
  ribs: 'Crispy Pork Chops.jpg',
  seafood: 'Seafood Meze Platter.jpg',
  prawn: 'Butter-garlic-prawns.jpg',
  oyster: 'Oyster.jpg',
  fish: 'Fish & Chips.jpg',
  salmon: 'Kingklip.png',
  pasta: 'Beef Fillet Pasta.jpg',
  chicken: 'Chicken Pasta.jpg',
  salad: 'Veg Meze Platter.jpg',
  sushi: 'Seafood Meze Platter.jpg',
  vegetarian: 'Veg Meze Platter.jpg',
  side: 'Zucchini Fries.jpg',
  starter: 'Cheese Croquettes.jpg',
};

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

const DESSERT_TERMS = ['dessert', 'cake', 'ice cream', 'cheesecake', 'sweet', 'baklava', 'fondant'];

const LOCAL_OPTIMIZED_VIDEO_MAP: Record<string, string> = {
  'baby marrow keftethes': 'Baby Marrow Keftethes.mp4',
  'baklava & ice cream': 'Baklava & Ice Cream.mp4',
  'beef fillet pasta': 'Beef Fillet Pasta.mp4',
  'bifteki burger': 'Bifteki Burger.mp4',
  'chicken pasta': 'Chicken Pasta.mp4',
  'fried brinjals with tzatziki': 'Fried Brinjals with Tzatziki.mp4',
  'frozen greek yoghurt': 'Frozen Greek Yoghurt.mp4',
  'meat meze platter': 'Meat Meze Platter.mp4',
  'mythos mixed meze': 'Mythos Mixed Meze.mp4',
  oyster: 'Oysters.mp4',
  oysters: 'Oysters.mp4',
  'prawn katafi': 'Prawn Katafi.mp4',
};

function mediaText(item: MenuItem): string {
  return [
    item.category,
    item.subcategory,
    item.types,
    item.name,
    item.description
  ].filter(Boolean).join(' ').toLowerCase();
}

function classificationText(item: MenuItem): string {
  return [
    item.category,
    item.subcategory,
    item.types,
    item.name
  ].filter(Boolean).join(' ').toLowerCase();
}

function normalizedMediaText(item: MenuItem): string {
  return mediaText(item).replace(/[^a-z0-9]+/g, '');
}

function hasTerm(text: string, term: string): boolean {
  const cleanText = text.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  const cleanTerm = term.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  const escaped = cleanTerm.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/\s+/g, '[^a-z0-9]+');
  return new RegExp(`(^|[^a-z0-9])${escaped}([^a-z0-9]|$)`, 'i').test(cleanText);
}

export function isDrinkItem(item: MenuItem): boolean {
  const text = classificationText(item);
  return [...DRINK_TERMS, ...EXTRA_DRINK_TERMS].some(term => hasTerm(text, term));
}

export function isDessertItem(item: MenuItem): boolean {
  const text = classificationText(item);
  return DESSERT_TERMS.some(term => hasTerm(text, term));
}

export function isVideoEligible(item: MenuItem): boolean {
  return !isDrinkItem(item);
}

function demoImageFor(item: MenuItem): string {
  const text = mediaText(item);
  const compact = normalizedMediaText(item);
  const map = isDrinkItem(item) ? DRINK_IMAGE_MAP : CATEGORY_IMAGE_MAP;

  for (const [kw, file] of Object.entries(map)) {
    if (text.includes(kw) || compact.includes(kw.replace(/[^a-z0-9]+/g, ''))) {
      return `${BASE_PATH}/Images/${file}`;
    }
  }

  if (isDessertItem(item)) return `${BASE_PATH}/Images/Cheese Cake.jpg`;
  return `${BASE_PATH}/Images/Tomahawk.jpg`;
}

function demoVideoFor(item: MenuItem): string | null {
  if (!isVideoEligible(item)) return null;
  const text = mediaText(item);
  const compactName = String(item.name || '').toLowerCase().replace(/[^a-z0-9]+/g, '');

  for (const [name, file] of Object.entries(LOCAL_OPTIMIZED_VIDEO_MAP)) {
    const compactKey = name.replace(/[^a-z0-9]+/g, '');
    if (compactName === compactKey || compactName.includes(compactKey) || compactKey.includes(compactName)) {
      return `${BASE_PATH}/Video/${file}`;
    }
  }

  if (isDessertItem(item)) return `${BASE_PATH}/Video/demo/dessert.mp4`;
  if (/(pasta|spaghetti|linguine|bolognese)/.test(text)) return `${BASE_PATH}/Video/demo/pasta.mp4`;
  if (/(seafood|prawn|shrimp|oyster|mussel|fish|salmon|kingklip|sole|calamari|squid)/.test(text)) {
    return `${BASE_PATH}/Video/demo/seafood.mp4`;
  }
  if (/(steak|beef|fillet|sirloin|rump|rib|burger|lamb|pork|chop|grill|tomahawk|venison|game|oxtail)/.test(text)) {
    return `${BASE_PATH}/Video/demo/steak-grill.mp4`;
  }
  if (/(starter|meze|tapas|halloumi|falafel|mushroom|vegetarian|side|salad|zucchini|brinjal|croquette|phyllo|spanakopita|tiropita|dolmades)/.test(text)) {
    return `${BASE_PATH}/Video/demo/seafood.mp4`;
  }
  return `${BASE_PATH}/Video/demo/steak-grill.mp4`;
}

export function resolveImage(item: MenuItem): string {
  if (item.imageVisible === false) return '';
  if (isDrinkItem(item)) return demoImageFor(item);

  const raw = item.img;
  if (raw && raw.trim()) {
    if (/^https?:\/\//.test(raw) || raw.startsWith('data:') || raw.startsWith('blob:')) {
      return raw;
    }
    if (raw.startsWith('/uploads/')) return demoImageFor(item);
    if (raw.startsWith(`${BASE_PATH}/`)) return raw;
    if (raw.startsWith('/')) return `${BASE_PATH}${raw}`;
    return `${BASE_PATH}/${raw}`;
  }

  // Infer from name/description
  const haystack = `${item.name} ${item.description || ''}`.toLowerCase();
  for (const [kw, file] of Object.entries(KEYWORD_MAP)) {
    if (haystack.includes(kw)) return `${BASE_PATH}/Images/${file}`;
  }

  return demoImageFor(item);
}

export function resolveVideo(item: MenuItem): string | null {
  if (item.videoVisible === false || !isVideoEligible(item)) return null;
  if (!item.video?.trim()) return demoVideoFor(item);
  const raw = item.video.trim();
  if (/^https?:\/\//.test(raw) || raw.startsWith('data:') || raw.startsWith('blob:') || raw.startsWith('/uploads/')) return demoVideoFor(item);
  if (raw.startsWith(`${BASE_PATH}/`)) return raw;
  if (raw.startsWith('/')) return `${BASE_PATH}${raw}`;
  return `${BASE_PATH}/${raw}`;
}

export function normalizeYouTubeId(value?: string): string {
  const raw = String(value || '').trim();
  if (!raw) return '';

  const direct = raw.match(/^[a-zA-Z0-9_-]{11}$/);
  if (direct) return raw;

  const patterns = [
    /youtu\.be\/([a-zA-Z0-9_-]{11})/,
    /youtube\.com\/embed\/([a-zA-Z0-9_-]{11})/,
    /youtube\.com\/shorts\/([a-zA-Z0-9_-]{11})/,
    /[?&]v=([a-zA-Z0-9_-]{11})/
  ];

  for (const pattern of patterns) {
    const match = raw.match(pattern);
    if (match?.[1]) return match[1];
  }

  return '';
}

export function resolveYouTubeEmbed(item: MenuItem, autoplay = false): string | null {
  if (item.videoVisible === false || !isVideoEligible(item)) return null;
  const id = normalizeYouTubeId(item.youtubeId);
  if (!id) return null;
  const params = new URLSearchParams({
    rel: '0',
    modestbranding: '1',
    playsinline: '1'
  });
  if (autoplay) {
    params.set('autoplay', '1');
    params.set('mute', '1');
  }
  return `https://www.youtube.com/embed/${id}?${params.toString()}`;
}

export function resolveAssetPath(path: string): string {
  const raw = String(path || '').trim();
  if (!raw) return raw;
  if (/^(?:[a-z]+:)?\/\//i.test(raw) || raw.startsWith('data:') || raw.startsWith('blob:')) return raw;
  if (raw.startsWith(`${BASE_PATH}/`)) return raw;
  if (raw.startsWith('/')) return `${BASE_PATH}${raw}`;
  return `${BASE_PATH}/${raw}`;
}
