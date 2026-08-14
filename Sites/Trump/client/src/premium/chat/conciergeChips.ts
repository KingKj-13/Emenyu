import type { CartItem } from '../../types/cart';

export interface ConciergeChip {
  label: string;
  message: string;
}

export const QUICK_ACTIONS: ConciergeChip[] = [
  { label: 'Recommend a wine', message: 'Can you recommend a wine for tonight?' },
  { label: 'Pair my drink', message: 'What food pairs with my drink?' },
  { label: "Chef's pick", message: "What's the chef's pick tonight?" },
  { label: 'Treat yourself', message: 'Is there a premium upgrade available for what I have?' },
  { label: 'Dessert', message: 'What would you recommend for dessert?' },
  { label: 'Coffee', message: 'What coffee would you recommend to finish?' },
  { label: 'Vegetarian', message: 'What vegetarian options do you have?' },
  { label: 'Best seller', message: "What's your best seller?" },
  { label: 'Surprise me', message: 'Surprise me with something great.' },
];

const STEAK_RE = /steak|ribeye|rib-eye|fillet|sirloin|rump|tomahawk|wagyu/i;
const HAS_DESSERT_TYPES = new Set(['DESSERT']);
const HAS_DRINK_TYPES = new Set(['WINE', 'DRINK']);

export function getContextChips(cartItems: CartItem[]): ConciergeChip[] {
  const names = cartItems.map(i => i.name);
  const hasSteak = names.some(n => STEAK_RE.test(n));
  const hasDessert = cartItems.some(i => (i.categoryType && HAS_DESSERT_TYPES.has(i.categoryType)));
  const hasDrink = cartItems.some(i => (i.categoryType && HAS_DRINK_TYPES.has(i.categoryType)));

  if (hasSteak) {
    return [
      { label: 'Best wine', message: 'What wine goes best with my steak?' },
      { label: 'Recommend sauce', message: 'What sauce would you recommend with this?' },
      { label: 'Dessert afterwards', message: 'What would you suggest for dessert afterwards?' },
      { label: 'Coffee pairing', message: 'What coffee would pair well to finish?' },
    ];
  }
  if (hasDessert) {
    return [
      { label: 'Coffee to finish', message: 'What coffee would you recommend to finish?' },
      { label: "Chef's pick", message: "What's the chef's pick tonight?" },
      { label: 'Surprise me', message: 'Surprise me with something great.' },
    ];
  }
  if (hasDrink && cartItems.length) {
    return [
      { label: 'Pair my drink', message: 'What food pairs with my drink?' },
      { label: "Chef's pick", message: "What's the chef's pick tonight?" },
      { label: 'Treat yourself', message: 'Is there a premium upgrade available for what I have?' },
      { label: 'Best seller', message: "What's your best seller?" },
    ];
  }
  if (cartItems.length) {
    return [
      { label: 'Recommend a wine', message: 'Can you recommend a wine for tonight?' },
      { label: "Chef's pick", message: "What's the chef's pick tonight?" },
      { label: 'Best seller', message: "What's your best seller?" },
    ];
  }
  return [
    { label: 'Recommend a wine', message: 'Can you recommend a wine for tonight?' },
    { label: "Chef's pick", message: "What's the chef's pick tonight?" },
    { label: "Today's specials", message: "What are today's specials?" },
    { label: 'Surprise me', message: 'Surprise me with something great.' },
  ];
}
