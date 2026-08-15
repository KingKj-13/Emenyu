import { useEffect, useRef, useState, useCallback } from 'react';
import type { CartItem } from '../types/cart';

// Phase 5 (AI Concierge) — presentation-layer timing ONLY. This hook never
// decides WHAT to recommend (that stays exclusively Recommendation Engine
// V2's job, requested via api.getRecommendations/api.chat); it only decides
// WHEN to ask for one and show it, per the product's scenario timings:
//   - drink(s) only in cart          -> wait 15s
//   - food only in cart (no drink)   -> wait 5s
//   - drink AND a main in cart       -> wait 10s, ask for an upgrade
//   - accepted                      -> stop, no immediate follow-up
//   - ignored                       -> never repeat that exact context,
//                                      wait for the cart to actually change
//   - demo dessert nudge            -> once, 60s after the upgrade moment
// Budgets: max 2 proactive nudges + 1 separate dessert nudge per visit, then
// reactive-only (the guest can still type/ask anything — unaffected by this
// hook, which only gates UNSOLICITED nudges).

export type CartState = 'empty' | 'drink-only' | 'food-only' | 'drink-and-main' | 'other';

const DRINK_TYPES = new Set(['WINE', 'DRINK']);
const FOOD_TYPES = new Set(['MAIN', 'STARTER', 'SUSHI']);

// Fallback classification for cart items that arrived without a categoryType
// (e.g. added before this feature shipped, or via a path that doesn't carry
// it yet) — a coarse keyword heuristic, not a re-implementation of the
// server's classifier; only ever used as a fallback.
const DRINK_KEYWORDS = /wine|beer|cocktail|lager|cider|champagne|sauvignon|cabernet|shiraz|merlot|pinotage|chardonnay|chenin|prosecco|mcc|coffee|espresso|cappuccino|latte|mocha|whisky|whiskey|vodka|gin|rum|brandy|cognac|tequila|margarita|mojito|martini/i;
const FOOD_KEYWORDS = /steak|ribeye|rib-eye|fillet|sirloin|rump|tomahawk|wagyu|chicken|lamb|pork|ribs|salmon|kingklip|hake|prawn|calamari|sushi|sashimi|pasta|burger|pizza|salad|starter|wings|snails|platter/i;

function itemIsDrink(item: CartItem): boolean {
  if (item.categoryType) return DRINK_TYPES.has(item.categoryType);
  return DRINK_KEYWORDS.test(item.name) && !FOOD_KEYWORDS.test(item.name);
}
function itemIsFood(item: CartItem): boolean {
  if (item.categoryType) return FOOD_TYPES.has(item.categoryType);
  return FOOD_KEYWORDS.test(item.name);
}

export function classifyCart(items: CartItem[]): CartState {
  if (!items.length) return 'empty';
  const hasDrink = items.some(itemIsDrink);
  const hasFood = items.some(itemIsFood);
  if (hasDrink && hasFood) return 'drink-and-main';
  if (hasDrink) return 'drink-only';
  if (hasFood) return 'food-only';
  return 'other';
}

const DELAY_BY_STATE: Record<CartState, number | null> = {
  empty: null,
  'drink-only': 15000,
  'food-only': 5000,
  'drink-and-main': 10000,
  other: null,
};

const MAX_PROACTIVE = 2;
const MAX_DESSERT = 1;
const DESSERT_DELAY_MS = 60000;

export type TriggerReason = 'pairing' | 'upgrade' | 'dessert';

interface UseConciergeTimingOptions {
  cartItems: CartItem[];
  chatOpen: boolean;
  /** true while a not-yet-resolved suggestion is on screen, or right after an accept */
  paused: boolean;
  onTrigger: (opts: { reason: TriggerReason }) => void;
}

export function useConciergeTiming({ cartItems, chatOpen, paused, onTrigger }: UseConciergeTimingOptions) {
  const [proactiveCount, setProactiveCount] = useState(0);
  const [dessertCount, setDessertCount] = useState(0);
  // Every (state, exact cart) combination a nudge has already been shown for —
  // scenario 5's "never repeat it" (an ignored suggestion's context is never
  // re-tried; only a genuinely different cart re-arms the timer).
  const shownContextsRef = useRef<Set<string>>(new Set());
  const sequenceCompletedAtRef = useRef<number | null>(null);
  const timerRef = useRef<number | null>(null);
  const dessertTimerRef = useRef<number | null>(null);

  const cartSignature = [...cartItems.map(i => i.name)].sort().join('|');
  const state = classifyCart(cartItems);

  const recordIgnored = useCallback((reason: TriggerReason, cartSigAtTime: string) => {
    // Already marked shown at trigger time; kept as an explicit API so the
    // caller's intent ("this was ignored, never show it again") is legible
    // rather than relying on the trigger-time side effect alone.
    void reason; void cartSigAtTime;
  }, []);

  useEffect(() => {
    if (timerRef.current) { window.clearTimeout(timerRef.current); timerRef.current = null; }
    if (paused || chatOpen) return;
    if (proactiveCount >= MAX_PROACTIVE) return;
    const delay = DELAY_BY_STATE[state];
    if (delay == null) return;
    const contextKey = `${state}:${cartSignature}`;
    if (shownContextsRef.current.has(contextKey)) return;

    timerRef.current = window.setTimeout(() => {
      shownContextsRef.current.add(contextKey);
      setProactiveCount(c => c + 1);
      const reason: TriggerReason = state === 'drink-and-main' ? 'upgrade' : 'pairing';
      if (state === 'drink-and-main') sequenceCompletedAtRef.current = Date.now();
      onTrigger({ reason });
    }, delay);

    return () => { if (timerRef.current) window.clearTimeout(timerRef.current); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state, cartSignature, chatOpen, paused, proactiveCount]);

  // Scenario 6 (demo only): once, 60s after the drink+main upgrade moment,
  // ask for a single dessert recommendation — a separate budget from the 2
  // general proactive nudges above.
  useEffect(() => {
    if (dessertTimerRef.current) { window.clearTimeout(dessertTimerRef.current); dessertTimerRef.current = null; }
    if (dessertCount >= MAX_DESSERT || !sequenceCompletedAtRef.current) return;
    const elapsed = Date.now() - sequenceCompletedAtRef.current;
    const remaining = Math.max(0, DESSERT_DELAY_MS - elapsed);
    dessertTimerRef.current = window.setTimeout(() => {
      setDessertCount(c => c + 1);
      onTrigger({ reason: 'dessert' });
    }, remaining);
    return () => { if (dessertTimerRef.current) window.clearTimeout(dessertTimerRef.current); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dessertCount, proactiveCount]);

  return {
    state,
    recordIgnored,
    proactiveCount,
    dessertCount,
    isExhausted: proactiveCount >= MAX_PROACTIVE && dessertCount >= MAX_DESSERT,
  };
}
