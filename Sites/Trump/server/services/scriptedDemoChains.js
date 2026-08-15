const { normalizeName } = require('../utils/helpers');

// Live-demo "Trump's Prime Grillhouse — Premium Dining Demo Scripts" hard-coded
// CHEF'S PICK chains (see demo trump rule.md). Each chain is an ordered list of
// real menu items: index 0 is the trigger the guest adds first; every item after
// it is the deterministic CHEF'S PICK once every item before it is in the cart.
// `price` disambiguates the two menu items that legitimately share a name
// (see KLEINE ZALZE VINEYARD SELECTION below — Chenin Blanc R255 vs Shiraz R295).
const TRUMP_CHAINS = [
  // Scenario 1 — The Steak & Red Wine Experience
  [
    { name: 'TRUMPS', price: 225 }, // Pinotage
    { name: 'RIBEYE 380g', price: 369, reason: "A bold, dark-fruit Pinotage is built for a well-marbled cut — the flagship dry-aged ribeye matches its weight." },
    { name: 'THREE PEPPERCORN SAUCE', price: 49, reason: 'The house steakhouse sauce — peppercorn lifts a ribeye without fighting the tannins in the red.' },
    { name: 'SAUTÉED MUSHROOMS WITH FRESH HERBS', price: 69, reason: "An earthy, umami side that echoes the wine's savoury notes and rounds out the plate." },
    { name: 'DEATH BY CHOCOLATE CAKE', price: 119, reason: 'A rich red wine and a decadent chocolate dessert is a textbook close.' },
    { name: 'IRISH COFFEE', price: 99, reason: 'A warm, spiked coffee to finish the evening — the classic after-dinner upsell.' }
  ],
  // Scenario 2 — Seafood & White Wine Experience
  [
    { name: 'GARLIC LEMON CALAMARI', price: 145 },
    { name: 'DIEMERSDAL', price: 260, reason: 'Creamy garlic calamari wants an acidic, citrus-driven white — a crisp Sauvignon Blanc cuts the richness.' },
    { name: 'KINGKLIP FILLET', price: 365, reason: 'The premium line-fish of the menu, and a natural main after a seafood starter.' },
    { name: 'SIDE GREEN SALAD', price: 99, reason: 'A fresh, light side keeps a fish plate elegant rather than heavy.' },
    { name: 'CAPE MALVA PUDDING', price: 115, reason: 'A warm South African signature dessert — a local, indulgent finish that contrasts a light meal.' },
    { name: 'CAPPUCCINO', price: 45, reason: 'A simple coffee to round off the meal.' }
  ],
  // Scenario 3 — Burger & Craft Beer Experience
  [
    { name: 'BACON AND CHEESE BURGER', price: 219 },
    { name: 'CORONA', price: 65, reason: "A burger's natural partner is an ice-cold beer — a crisp imported lager is the effortless pairing." },
    { name: 'ONION RINGS', price: 65, reason: 'The quintessential burger side — crunchy, shareable, and an easy add.' },
    { name: 'FIRECRACKER CHICKEN WINGS (400g)', price: 175, reason: 'A sticky, shareable plate for the table — the "just one more thing" a casual group always says yes to.' },
    { name: 'CHOCOLATE BROWNIE', price: 115, reason: 'A familiar, crowd-pleasing dessert to finish a laid-back meal.' },
    { name: 'DOM PEDRO', price: 99, reason: 'The South African after-dinner classic — an easy, indulgent close.' }
  ],
  // Scenario 4 — Date Night Fine Dining
  [
    { name: 'CRISPY RICE', price: 195 },
    { name: 'DA LUCA ROSÉ PROSECCO', price: 350, reason: 'A shareable crispy-rice starter sets a celebratory tone; a chilled rosé prosecco is the romantic, table-for-two pour.' },
    { name: 'FILLET 260g', price: 329, reason: 'The most refined, tender cut on the grill — the elegant centre of a date-night main.' },
    { name: 'MUSHROOM TRUFFLE BUTTER', price: 49, reason: 'A small luxury that turns a fillet into an occasion — truffle reads as "special."' },
    { name: 'CREAMED SPINACH', price: 65, reason: 'A classic steakhouse side to share across the table.' },
    { name: 'DEATH BY CHOCOLATE CAKE', price: 119, reason: 'One decadent dessert, two forks — the signature date-night finish.' },
    { name: 'DOM AMARULA', price: 115, reason: 'A creamy, indulgent nightcap to linger over.' }
  ],
  // Scenario 5 — Business Dinner
  [
    { name: 'BEEF BILTONG', price: 155 },
    { name: 'KLEINE ZALZE VINEYARD SELECTION', price: 295, reason: 'A shared plate of biltong opens the table; a confident Shiraz is the safe, impressive red to put in the middle of a business dinner.' }, // Shiraz — same name as the R255 Chenin Blanc, disambiguated by price
    { name: 'T-BONE 500g', price: 329, reason: 'A substantial, classic steakhouse cut — the natural main for a hearty red.' },
    { name: 'ONION RINGS', price: 65, reason: 'An easy shared side for the table.' },
    { name: 'CAPE MALVA PUDDING', price: 115, reason: 'A local signature dessert — a warm, memorable finish that shows off the venue.' },
    { name: 'AMERICANO COFFEE', price: 39, reason: 'A straight black coffee — the right, unfussy close for a working dinner.' }
  ],
  // Scenario 6 — Celebration Dinner
  [
    { name: 'MOËT & CHANDON BRUT', price: 1950 },
    { name: 'THE KING, QUEEN PLATTER', price: 649, reason: 'A bottle of Moët signals a celebration — the showpiece sharing platter is the natural centrepiece for a group.' },
    { name: '6 QUEEN PRAWNS', price: 309, reason: 'A generous seafood addition turns the platter into a full surf-and-turf spread for the table.' },
    { name: 'SIDE GREEN SALAD', price: 99, reason: 'A fresh, shareable side to balance a rich, meat-heavy feast.' },
    { name: 'TRIO OF ICE CREAM', price: 119, reason: 'A shareable dessert with three spoons in the middle of the table — the easy celebratory sweet.' },
    { name: 'DOM PEDRO', price: 99, reason: 'A crowd-pleasing after-dinner treat to round off the party.' }
  ]
];

// "Carmella by Sir Gaspard" demo scripts — the six deterministic dining
// stories from the 2026-07-12 demo-validation report (Part 8). Each chain
// carries a `daypart` (morning | midday | golden, matching Carmella's
// DayPart.slug values) purely as documentation of which menu the story is
// meant to run on — resolveScriptedPick() does NOT gate on it (see below);
// matching is by trigger item alone so a chain can never silently fail to
// fire from a wiring gap in the client's day-part param.
const CARMELLA_CHAINS = [
  // M-1 — The Quick Business Breakfast (morning)
  [
    { name: 'Morning in Jozi', price: 135 },
    { name: 'Americano', price: 35, reason: 'A clean, direct coffee for a working morning — nothing to slow you down.' },
    { name: 'Red Juice', price: 70, reason: 'A cold-pressed lift beside the coffee — beetroot, carrot, apple and ginger. Vitamins without the wait.' }
  ],
  // M-2 — The Healthy Start (morning)
  [
    { name: 'Whole Oats', price: 135 },
    { name: 'Green Juice', price: 70, reason: 'A green pressing to sit beside the oats — apple, spinach, celery, mint and cucumber. Clean and awake.' },
    { name: 'Nicole in Thessaloniki', price: 140, reason: 'If the table is sharing, this fruit-and-yoghurt bowl keeps the whole morning light.' },
    { name: "Jennifer's Vanilla Matcha", price: 55, reason: 'A gentle matcha instead of coffee — steady energy, no jitter.' }
  ],
  // M-3 — The Premium Weekend Breakfast (morning)
  [
    { name: "Matteo's Mimosa", price: 89 },
    { name: 'Mademoiselle Benedict', price: 150, reason: "A mimosa asks for something indulgent — poached eggs and hollandaise are the weekend's centrepiece." },
    { name: "Diane's French Toast", price: 115, reason: 'One sweet plate to share between you — brioche soaked in egg and cream.' },
    { name: 'Cappuccino', price: 35, reason: 'A proper cappuccino to slow the morning down.' },
    { name: 'Brussels Waffles', price: 110, reason: "If you're lingering, warm Belgian waffles are the unhurried finish." }
  ],
  // A-1 — The Casual Lunch (midday)
  [
    { name: 'Calamari in Nice', price: 140 },
    { name: 'Texan Beef Burger', price: 170, reason: 'After the calamari, an easy, generous main — gourmet beef with bacon and a fried egg.' },
    { name: "Femi's", price: 50, reason: 'Golden fries to share in the middle of the table.' },
    { name: 'Corona', price: 50, reason: "A burger's natural partner is an ice-cold beer — crisp and effortless." },
    { name: 'Chocolate Brownie', price: 100, reason: 'A fudgy brownie to close a laid-back lunch.' }
  ],
  // A-2 — The Business Lunch (midday)
  [
    { name: 'Burrata in Venice', price: 170 },
    { name: "Oslo's Flame", price: 265, reason: 'A clean, confident main — grilled salmon that never weighs the afternoon down.' },
    { name: 'Tokara Sauvignon Blanc', price: 375, reason: 'A crisp Sauvignon Blanc to share — it lifts the salmon and the conversation without dominating either.' },
    { name: 'Sir Gaspard Salad', price: 155, reason: 'A bright cauliflower-and-goat-cheese salad for the middle of the table.' },
    { name: 'Americano', price: 35, reason: 'A straight black coffee to close and get back to the day.' }
  ],
  // A-3 — The Premium Dinner / Celebration (golden)
  [
    { name: "Sir Gaspard's Garden Spritz", price: 120 },
    { name: 'Prawns in Maputo', price: 140, reason: 'A spritz opens the evening; garlic prawns are the plate everyone reaches for first.' },
    { name: 'Iron Fillet', price: 265, reason: 'The most refined thing off the grill — a herb-crusted fillet finished with a wine jus.' },
    { name: 'Rupert & Rothschild Classique Blend', price: 650, reason: 'A Bordeaux-style Cape blend for the fillet — structure to match the herbs and the jus.' },
    { name: "MC's", price: 50, reason: 'A roasted-vegetable side to share across the table.' },
    { name: 'Positano Lemon Crème Brûlée', price: 100, reason: 'Bright enough to follow a red, indulgent enough for the occasion.' },
    { name: 'Hozanna Velvet Shot', price: 100, reason: 'An espresso martini to end the night exactly as it should.' }
  ]
];

const CHAINS_BY_RESTAURANT = {
  trump: TRUMP_CHAINS,
  carmella: CARMELLA_CHAINS
};

function stepKey(step) {
  return normalizeName(step.name);
}

// cartNames: array of already-normalized cart item names (aiService's
// `normalizeName`). opts.restaurantId selects which tenant's chain set to
// match against — defaults to 'trump' so every existing call site (none of
// which passed a second argument before this tenant split) keeps behaving
// exactly as it did. Returns:
//   - the next chain step ({ name, price, reason }) to recommend, or
//   - 'done' when the matched chain's final step is already in the cart
//     (the demo should stop showing a CHEF'S PICK), or
//   - null when no chain's trigger is present (not a scripted cart).
// When cart items match more than one chain's trigger, the most-advanced
// chain wins (deterministic tie-break: first chain defined, in that tenant's
// array order). Deliberately NOT gated by day-part: every trigger name across
// both tenants' chains is unique, so there is no ambiguity to resolve by
// day-part, and gating on a client-supplied day-part would risk the demo
// silently going quiet if that param is ever missing or wrong — reliability
// over flexibility for a live pitch.
function resolveScriptedPick(cartNames, opts = {}) {
  const restaurantId = opts.restaurantId || 'trump';
  const chains = CHAINS_BY_RESTAURANT[restaurantId] || [];
  const cartSet = new Set(cartNames);
  let best = null;

  for (const chain of chains) {
    if (!cartSet.has(stepKey(chain[0]))) continue;
    let progress = 0;
    while (progress < chain.length && cartSet.has(stepKey(chain[progress]))) progress++;
    if (!best || progress > best.progress) best = { chain, progress };
  }

  if (!best) return null;
  if (best.progress >= best.chain.length) return 'done';
  return best.chain[best.progress];
}

module.exports = { CHAINS: TRUMP_CHAINS, TRUMP_CHAINS, CARMELLA_CHAINS, resolveScriptedPick };
