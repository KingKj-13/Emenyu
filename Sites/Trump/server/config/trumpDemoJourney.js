'use strict';
// Curated Demo Mode — Trump Prime Grillhouse
//
// SINGLE SOURCE OF TRUTH for the curated live-demo dining journeys. Everything
// an admin might want to tweak for a demo (which dishes, in what order, what
// the chatbot says, what the waiter says, the reward copy) lives here as data
// — no other file should hardcode a dish name, price, or line of demo copy.
//
// Consumed by server/services/curatedDemoJourney.js (the accept/skip/no-loop
// stage machine) and by server/controllers/rewardController.js (the reward
// follow-up messages). Every price below was verified against the live menu
// (https://emenyu.com/Trump/api/menu) at authoring time, except where flagged
// `// CONFIRM PRICE` — check the admin menu panel for the current value
// before running a demo that depends on it.
//
// Design rule enforced by curatedDemoJourney.js, not by this data: every
// journey ends at dessert. No coffee, no digestif, no further recommendation
// after dessert is offered/accepted.

const JOURNEYS = [
  {
    id: 'steakhouse-classic',
    label: "The Steakhouse Classic",
    starter: { name: 'BEEF BILTONG', price: 155 },
    // Offered in this order; guest Accept (adds to cart) stops the chain here.
    // Skip advances to the next entry. After the last entry is skipped, no
    // further main is offered (no loop back to the first).
    mains: [
      {
        name: 'RIBEYE 380g',
        price: 369,
        reason: "Our chef usually recommends the ribeye here — beef biltong opens the table, and this is the cut that answers it best: well-marbled, full-flavoured, our most-loved steak.",
        side: { name: 'SAUTÉED MUSHROOMS WITH FRESH HERBS', price: 69, reason: "An earthy, herb-forward side that echoes the ribeye's richness without competing with it." },
        drink: { name: 'KLEINE ZALZE VINEYARD SELECTION', price: 295, reason: "A confident Shiraz — pairs beautifully with the char on the beef without fighting the tannins." }
      },
      {
        name: 'FILLET 260g',
        price: 329,
        reason: "If you'd prefer something more delicate, the fillet is the most tender cut on the grill — because sometimes the guest wants a lighter touch, not a bigger plate.",
        side: { name: 'CREAMED SPINACH', price: 65, reason: "A classic steakhouse side — soft, rich, and never overpowers the fillet." },
        drink: { name: 'KLEINE ZALZE VINEYARD SELECTION', price: 295, reason: "Still a beef dish at heart, so the same confident Shiraz carries through — pairs beautifully without overwhelming the fillet's delicacy." }
      },
      {
        name: 'T-BONE 500g',
        price: 329,
        reason: "For the classic steakhouse experience, the T-Bone is a hearty, honest cut — because sometimes simple is exactly right.",
        side: { name: 'ONION RINGS', price: 65, reason: "Crunchy, unfussy, and built for a big, honest cut like this." },
        drink: { name: 'KLEINE ZALZE VINEYARD SELECTION', price: 295, reason: "A hearty cut deserves a hearty red — pairs beautifully with the T-Bone's char." }
      }
    ],
    dessert: { name: 'CAPE MALVA PUDDING', price: 115, reason: "A warm, distinctly South African way to close the table — because the meal should end on something that feels like home." }
  },
  {
    id: 'date-night-warmer',
    label: 'Date Night, But Warmer',
    starter: { name: 'CRISPY RICE', price: 195 },
    mains: [
      {
        name: 'FILLET 260g',
        price: 329,
        reason: "Our chef usually recommends the fillet here — it's the most refined cut on the grill, and the natural centre of an evening like this.",
        side: { name: 'CREAMED SPINACH', price: 65, reason: "A quiet, classic side that lets the fillet stay the centre of attention." },
        drink: { name: 'KLEINE ZALZE VINEYARD SELECTION', price: 295, reason: "A confident Shiraz — pairs beautifully with the fillet without ever overpowering it." }
      },
      {
        name: 'KINGKLIP FILLET',
        price: 365,
        reason: "If you'd rather keep it lighter, our premium line-fish is just as much of an occasion — delicate, and every bit as elegant.",
        side: { name: 'SIDE GREEN SALAD', price: 99, reason: "Fresh and bright, so the plate stays light and elegant alongside the kingklip." },
        drink: { name: 'DIEMERSDAL', price: 260, reason: "A crisp Sauvignon Blanc — pairs beautifully by lifting the fish instead of competing with it." }
      },
      {
        name: 'WAGYU RIBEYE 300g',
        price: 699,
        reason: "For the table that wants to make tonight memorable, this is the one — because an occasion like this deserves the best marbling in the house.",
        side: { name: 'SAUTÉED MUSHROOMS WITH FRESH HERBS', price: 69, reason: "Earthy and herb-forward, built to stand beside a cut this special without distracting from it." },
        drink: { name: 'KLEINE ZALZE VINEYARD SELECTION', price: 295, reason: "The Wagyu deserves a serious red — pairs beautifully with the marbling, and it's still not the most expensive bottle on our list." }
      }
    ],
    dessert: { name: 'DEATH BY CHOCOLATE CAKE', price: 119, reason: "One cake, two forks — because that's exactly how an evening like this should end." }
  },
  {
    id: 'sunday-best',
    label: 'Sunday Best',
    starter: { name: 'FIRECRACKER CHICKEN WINGS (400g)', price: 175 },
    mains: [
      {
        name: 'BACON AND CHEESE BURGER',
        price: 219,
        reason: "Our chef usually recommends the bacon and cheese burger after the wings — easy, generous, and exactly the kind of meal that isn't trying to impress anyone but you.",
        side: { name: 'ONION RINGS', price: 65, reason: "The classic burger side — crunchy, shareable, no fuss." },
        drink: { name: 'CORONA', price: 65, reason: "A burger always wants an ice-cold beer — pairs beautifully, nothing more complicated than that." }
      },
      {
        name: 'HALF CHICKEN',
        price: null, // CONFIRM PRICE — not verifiable from the public menu API at authoring time; check the admin menu panel before this journey runs live.
        reason: "If you'd rather something lighter than a burger, the half chicken is just as easy, and just as unpretentious.",
        side: { name: 'ONION RINGS', price: 65, reason: "Keeps the casual, shareable feel of the table going." },
        drink: { name: 'CORONA', price: 65, reason: "Still the same easy pairing — pairs beautifully with grilled chicken too." }
      },
      {
        name: 'RUMP 400g',
        price: 269,
        reason: "Still off our grill, still simple, still exactly what you came for — the most affordable serious cut we serve, and it doesn't feel like a downgrade.",
        side: { name: 'ONION RINGS', price: 65, reason: "Keeps the whole table casual and shareable." },
        drink: { name: 'CORONA', price: 65, reason: "Pairs beautifully whether the plate is a burger or a steak — that's the point of this journey." }
      }
    ],
    dessert: { name: 'CHOCOLATE BROWNIE', price: 115, reason: "Familiar and crowd-pleasing — the kind of dessert nobody has to think twice about." }
  }
];

// Copy used outside the per-item `reason` strings above — the chat/waiter
// follow-up moments the task calls "reward messages" / "waiter messages".
// Kept here, not hardcoded in ChatPanel/WaiterPage, per the "everything
// editable from one place" requirement.
const MESSAGES = {
  chat: {
    // Shown once the journey reaches 'done' (dessert offered/accepted) and the
    // guest accepted most of what was offered along the way.
    orderCompleteThankYou: "Thank you for letting me guide you through tonight's meal — I hope every course landed the way I hoped it would.",
    // Shown when the guest skipped most of what was offered — the "make-good" moment.
    orderCompleteMakeGood: "It looks like tonight's recommendations weren't quite your taste — your next drink is on us. Here's a QR code for the bar.",
    rewardRedeemInstructions: "Show this code to your waiter or at the bar before it expires. One scan, one drink — thank you for dining with us."
  },
  waiter: {
    // Read-aloud prompt for the waiter when a curated main is offered.
    presentMain: (name, reason) => `Chef's pick: ${name}. ${reason}`,
    presentSide: (name, reason) => `And to go with it — ${name}. ${reason}`,
    presentDrink: (name, reason) => `${name} — ${reason}`,
    presentDessert: (name, reason) => `To close things off — ${name}. ${reason}`,
    orderCompletePrompt: 'Order marked complete — check the guest chat for the automatic thank-you / reward follow-up.'
  },
  reward: {
    // Fraud-protection copy shown to staff when redeeming.
    redeemedOk: 'Reward redeemed — one free drink, this visit only.',
    redeemedAlready: 'This reward has already been redeemed.',
    redeemedExpired: 'This reward code has expired.',
    redeemedInvalid: 'This reward code is not valid.'
  }
};

// A guest is judged to have "enjoyed the recommendations" (thank-you path,
// not the make-good path) once they've accepted at least this many of the
// curated stage offers (main + side + drink + dessert = 4 possible accepts
// per journey; 2+ reads as genuine engagement, not just tolerance).
const ENJOYED_THRESHOLD = 2;

module.exports = { JOURNEYS, MESSAGES, ENJOYED_THRESHOLD };
